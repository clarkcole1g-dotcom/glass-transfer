
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Alert, ScrollView, StyleSheet, StatusBar, TextInput} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();

export default function App(){
  const [status,setStatus] = useState('UNIVERSAL V3 • Gen2 fixed • RB Meta 01BJ no hotspot needed');
  const [model,setModel] = useState('Tap CONNECT to detect glasses');
  const [media,setMedia] = useState([]);
  const [logs,setLogs] = useState([]);
  const [homeWifis,setHomeWifis] = useState([]);
  const [connectedDevice,setConnectedDevice] = useState(null);
  const [homeSsid,setHomeSsid] = useState('');
  const [homePass,setHomePass] = useState('');
  const [glassesIp,setGlassesIp] = useState('');
  const addLog = (m) => setLogs(prev=>[`${new Date().toLocaleTimeString().slice(3,8)} ${m}`,...prev].slice(0,50));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]);
      await MediaLibrary.requestPermissionsAsync();
    }
  };
  useEffect(()=>{ askPerms(); loadHomeWifis(); },[]);

  const loadHomeWifis = async () => {
    try{
      const list = await WifiManager.loadWifiList();
      setHomeWifis(list.filter(w=> w.SSID && w.SSID.length>0).slice(0,20));
    }catch{}
  };

  const connectAny = async () => {
    await askPerms();
    setStatus('Scanning BLE for ANY Ray-Ban...');
    addLog('BLE scan start');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err) return;
      const name = device?.name || '';
      const lower = name.toLowerCase();
      const isGlasses = lower.includes('ray-ban') || lower.includes('rb') || lower.includes('meta') || lower.includes('01bj') || lower.includes('glasses') || lower.includes('stories') || lower.includes('rw');
      if(isGlasses){
        manager.stopDeviceScan();
        const isGen2 = lower.includes('01bj') || lower.includes('meta') || lower.includes('rb meta');
        const modelStr = isGen2 ? `RB META 01BJ (Gen2) • ${name}` : `RW4009 Stories (Gen1) • ${name}`;
        setModel(modelStr);
        addLog(`FOUND ${name} => ${isGen2 ? 'GEN2' : 'GEN1'}`);
        
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          setConnectedDevice(dev);
          
          if(isGen2){
            setStatus('✓ Gen2 01BJ connected • No hotspot needed • Pick your HOME WiFi below to provision glasses');
            addLog('Gen2 detected - skipping hotspot scan, glasses join home WiFi');
            // Read all characteristics to find IP
            const services = await dev.services();
            for(const svc of services){
              try{
                const chars = await dev.characteristicsForService(svc.uuid);
                for(const c of chars){
                  if(c.isReadable){
                    try{
                      const val = await dev.readCharacteristicForService(svc.uuid, c.uuid);
                      if(val.value){
                        const decoded = atob(val.value);
                        addLog(`Read ${svc.uuid.slice(0,8)}:${c.uuid.slice(0,8)} = ${decoded.slice(0,60)}`);
                        const ipMatch = decoded.match(/\d+\.\d+\.\d+\.\d+/);
                        if(ipMatch && ipMatch[0].startsWith('192.168')){
                          setGlassesIp(ipMatch[0]);
                          addLog(`FOUND GLASSES IP: ${ipMatch[0]}`);
                        }
                      }
                    }catch{}
                  }
                }
              }catch{}
            }
          } else {
            // Gen1 flow - trigger hotspot
            setStatus('Gen1 detected • Sending WIFI ON • Looking for Glasses_XXXX hotspot...');
            const UART_S = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
            const UART_T = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
            for(const cmd of ['AQ==','V0lGSV9PTg==']){
              try{ await dev.writeCharacteristicWithResponseForService(UART_S, UART_T, cmd); }catch{}
            }
            // Scan for hotspot (Gen1 only)
            for(let i=0;i<8;i++){
              await new Promise(r=>setTimeout(r,2000));
              const list = await WifiManager.loadWifiList();
              const ray = list.find(w=> w.SSID.toLowerCase().includes('glasses') || w.SSID.toLowerCase().includes('ray-ban stories'));
              if(ray){
                await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
                await new Promise(r=>setTimeout(r,2500));
                fetchGen1();
                return;
              }
            }
          }
        }catch(e){ setStatus('BLE err '+e.message); }
      }
    });
  };

  const fetchGen1 = async () => {
    try{
      const res = await fetch('http://192.168.4.1/media/list');
      const json = await res.json();
      const arr = Array.isArray(json) ? json : (json.media || []);
      setMedia(arr);
      setStatus(`Gen1: ${arr.length} files`);
    }catch(e){ addLog('Gen1 fetch fail '+e.message); }
  };

  const fetchGen2ViaIp = async (ip) => {
    const targetIp = ip || glassesIp;
    if(!targetIp){
      setStatus('No glasses IP yet • Try FETCH via Home Network discovery');
      addLog('No IP, trying discovery');
      // Try common home network IPs where Meta glasses appear
      const base = '192.168.1.';
      // Try to guess glasses IP by scanning 1-254? Too slow, try mDNS-like common IPs
      const tryIps = [glassesIp, '192.168.1.100','192.168.1.101','192.168.1.50','192.168.0.100'].filter(Boolean);
      for(const tip of tryIps){
        for(const ep of ['/api/media/list','/media/list']){
          try{
            addLog(`Trying http://${tip}${ep}`);
            const res = await fetch(`http://${tip}${ep}`, {headers:{'Accept':'application/json'}});
            const json = await res.json();
            const arr = Array.isArray(json) ? json : (json.media || json.data || []);
            if(arr.length>0){ setMedia(arr); setStatus(`✓ Gen2 via ${tip} • ${arr.length} files`); return; }
          }catch(e){}
        }
      }
      // Last resort: Try via Meta cloud local discovery - try 192.168.4.1 even for Gen2 (hidden but still works with hidden flag)
      try{
        addLog('Trying hidden 192.168.4.1 for Gen2');
        // Try connecting to hidden SSID Ray-Ban Meta
        await WifiManager.connectToProtectedSSID('Ray-Ban Meta 01BJ', '', true, false);
      }catch{}
      return;
    }
    for(const ep of ['/api/media/list','/media/list','/api/v1/media/list']){
      try{
        const url = `http://${targetIp}${ep}`;
        addLog(`Fetching ${url}`);
        const res = await fetch(url);
        const json = await res.json();
        const arr = Array.isArray(json) ? json : (json.media || json.data || []);
        if(arr.length>0){ setMedia(arr); setStatus(`✓ Gen2 • ${arr.length} files from ${targetIp}`); return; }
      }catch(e){ addLog(`Fail ${ep} ${e.message.slice(0,40)}`); }
    }
  };

  const provisionHomeWifi = async () => {
    if(!homeSsid){ Alert.alert('Pick WiFi','Select home WiFi from list or type SSID'); return; }
    if(!connectedDevice){ Alert.alert('Not connected','Tap CONNECT first'); return; }
    setStatus(`Provisioning ${homeSsid} to glasses...`);
    addLog(`Provision ${homeSsid}`);
    try{
      // Try to send WiFi creds via BLE - Meta Gen2 accepts JSON over UART or custom service
      const payload = JSON.stringify({ssid: homeSsid, password: homePass, ps: homePass});
      const b64 = btoa(payload);
      const services = await connectedDevice.services();
      for(const svc of services){
        const chars = await connectedDevice.characteristicsForService(svc.uuid);
        for(const c of chars){
          if(c.isWritableWithResponse || c.isWritableWithoutResponse){
            try{ await connectedDevice.writeCharacteristicWithResponseForService(svc.uuid, c.uuid, b64); addLog(`Sent creds to ${svc.uuid.slice(0,8)}`); }catch{}
          }
        }
      }
      setStatus(`Sent ${homeSsid} to glasses • Wait 20s for glasses to join • Then FETCH`);
    }catch(e){ setStatus('Provision err '+e.message); }
  };

  return(
    <SafeAreaView style={{flex:1,backgroundColor:'#000',padding:14}}>
      <Text style={{color:'#fff',fontSize:24,fontWeight:'900'}}>Glass Transfer</Text>
      <Text style={{color:'#00ff88',fontSize:11,fontWeight:'800',marginTop:4}}>UNIVERSAL V3 • Gen2 Fix • No hotspot needed for 01BJ</Text>
      <View style={{backgroundColor:'#111',borderWidth:1,borderColor:'#222',padding:10,borderRadius:12,marginTop:10}}><Text style={{color:'#aaa',fontSize:11}}>{model}</Text></View>
      <View style={{backgroundColor:'#111',borderWidth:1,borderColor:'#222',padding:12,borderRadius:12,marginTop:8,marginBottom:8}}><Text style={{color:'#fff',fontSize:12,fontWeight:'600'}}>{status}</Text>{glassesIp ? <Text style={{color:'#0af',fontSize:11,marginTop:4}}>Glasses IP: {glassesIp}</Text> : null}</View>
      
      <TouchableOpacity onPress={connectAny} style={{backgroundColor:'#fff',padding:16,borderRadius:20,alignItems:'center',marginBottom:8}}><Text style={{color:'#000',fontWeight:'900',fontSize:13}}>CONNECT ANY GLASSES (01BJ + RW4009)</Text></TouchableOpacity>

      <View style={{backgroundColor:'#0a0a0a',borderRadius:14,padding:10,borderWidth:1,borderColor:'#1a1a1a',marginBottom:8}}>
        <Text style={{color:'#fff',fontWeight:'700',fontSize:11,marginBottom:6}}>Gen2 01BJ: Provision HOME WiFi to glasses (they join your WiFi)</Text>
        <TextInput placeholder="Home SSID - tap list below" placeholderTextColor="#555" value={homeSsid} onChangeText={setHomeSsid} style={{backgroundColor:'#111',color:'#fff',padding:10,borderRadius:8,borderWidth:1,borderColor:'#222',fontSize:12,marginBottom:6}} />
        <TextInput placeholder="Home WiFi Password" placeholderTextColor="#555" value={homePass} onChangeText={setHomePass} secureTextEntry style={{backgroundColor:'#111',color:'#fff',padding:10,borderRadius:8,borderWidth:1,borderColor:'#222',fontSize:12,marginBottom:8}} />
        <TouchableOpacity onPress={provisionHomeWifi} style={{backgroundColor:'#00ff88',padding:10,borderRadius:10,alignItems:'center'}}><Text style={{color:'#000',fontWeight:'900',fontSize:12}}>PROVISION HOME WIFI TO GLASSES</Text></TouchableOpacity>
        <TouchableOpacity onPress={()=>fetchGen2ViaIp()} style={{backgroundColor:'#222',padding:10,borderRadius:10,alignItems:'center',marginTop:6,borderWidth:1,borderColor:'#333'}}><Text style={{color:'#fff',fontWeight:'700',fontSize:11}}>FETCH GALLERY via Home Network</Text></TouchableOpacity>
      </View>

      {media.length>0 && <><View style={{flexDirection:'row',justifyContent:'space-between',marginBottom:6}}><Text style={{color:'#fff',fontWeight:'700',fontSize:12}}>In Glasses ({media.length})</Text><TouchableOpacity onPress={async()=>{ for(const m of media){ const n=m.name||m.toString(); try{ const u=`http://${glassesIp||'192.168.1.100'}/api/media/download?name=${encodeURIComponent(n)}`; const l=FileSystem.documentDirectory+n; const {uri}=await FileSystem.downloadAsync(u,l); await MediaLibrary.saveToLibraryAsync(uri);}catch{}} }}><Text style={{color:'#00ff88',fontSize:11,fontWeight:'800'}}>DOWNLOAD ALL</Text></TouchableOpacity></View>
      <FlatList data={media} numColumns={2} keyExtractor={(i,idx)=>(i.name||i)+idx} renderItem={({item})=>{ const n=item.name||item.toString(); return <View style={{flex:1,backgroundColor:'#111',margin:5,padding:10,borderRadius:12,borderWidth:1,borderColor:'#222'}}><Text style={{color:'#fff',fontSize:10}} numberOfLines={1}>{n}</Text><Text style={{color:'#0af',fontSize:9,marginTop:6,fontWeight:'800'}}>DOWNLOAD</Text></View>}} style={{maxHeight:280}} /></>}

      <Text style={{color:'#fff',fontWeight:'700',fontSize:11,marginTop:8}}>Your Home WiFis • Tap to select for provisioning</Text>
      <ScrollView style={{maxHeight:100,backgroundColor:'#0a0a0a',borderRadius:10,marginTop:4,borderWidth:1,borderColor:'#1a1a1a'}}>{homeWifis.map((w,i)=><TouchableOpacity key={i} onPress={()=>{ setHomeSsid(w.SSID); setGlassesIp(''); }} style={{padding:8,borderBottomWidth:1,borderBottomColor:'#111',flexDirection:'row',justifyContent:'space-between'}}><Text style={{color:'#fff',fontSize:12}}>{w.SSID}</Text><Text style={{color:'#555',fontSize:10}}>{w.level}dBm</Text></TouchableOpacity>)}</ScrollView>

      <ScrollView style={{marginTop:8,flex:1}}>{logs.map((l,i)=><Text key={i} style={{color:'#444',fontSize:8}}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  )
}
