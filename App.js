
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Alert, ScrollView, StyleSheet} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();

export default function App(){
  const [status,setStatus] = useState('V4 FINAL • RB Meta 01BJ • Assumes glasses already on VM8525306 via Meta View');
  const [media,setMedia] = useState([]);
  const [logs,setLogs] = useState([]);
  const [glassesIp,setGlassesIp] = useState('');
  const [scanning,setScanning] = useState(false);
  const addLog = (m) => setLogs(p=> [m, ...p].slice(0,50));

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
  useEffect(()=>{ askPerms(); },[]);

  const scanLocalNetwork = async () => {
    setScanning(true);
    setStatus('Scanning VM8525306 network for RB Meta 01BJ...');
    addLog('Scanning local network 192.168.0.x for glasses');
    // Get phone IP to know subnet - try to discover via common gateway
    const baseIps = ['192.168.0.','192.168.1.'];
    const endpoints = ['/api/media/list','/media/list'];
    
    for(const base of baseIps){
      const promises = [];
      for(let i=1;i<255;i++){
        const ip = base+i;
        promises.push((async()=>{
          for(const ep of endpoints){
            try{
              const controller = new AbortController();
              setTimeout(()=>controller.abort(), 1500);
              const res = await fetch(`http://${ip}${ep}`, {signal: controller.signal});
              if(res.ok){
                const json = await res.json();
                const arr = Array.isArray(json) ? json : (json.media || json.data || []);
                if(arr.length>=0){ // even 0 means we found glasses
                  addLog(`FOUND at ${ip} ${arr.length} files`);
                  setGlassesIp(ip);
                  if(arr.length>0){ setMedia(arr); setStatus(`✓ Found RB Meta at ${ip} • ${arr.length} files`); }
                  return ip;
                }
              }
            }catch(e){}
          }
          return null;
        })());
        if(i%20===0){
          const results = await Promise.all(promises.splice(0,20));
          const found = results.find(r=>r);
          if(found){ setScanning(false); return; }
        }
      }
    }
    setStatus('Scan done • No glasses found • Make sure glasses are on VM8525306 via Meta View and taken OUT of case');
    setScanning(false);
  };

  const connectBleAndGetIp = async () => {
    await askPerms();
    setStatus('Connecting BLE to read glasses IP...');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err) return;
      const n = device?.name || '';
      if(n.toLowerCase().includes('ray-ban') || n.toLowerCase().includes('meta') || n.toLowerCase().includes('01bj')){
        manager.stopDeviceScan();
        setStatus(`BLE: ${n} • Reading IP...`);
        addLog(`BLE ${n}`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          const services = await dev.services();
          for(const svc of services){
            try{
              const chars = await dev.characteristicsForService(svc.uuid);
              for(const c of chars){
                if(c.isReadable){
                  try{
                    const v = await dev.readCharacteristicForService(svc.uuid, c.uuid);
                    if(v.value){
                      const dec = atob(v.value);
                      const ip = dec.match(/\d+\.\d+\.\d+\.\d+/);
                      if(ip && ip[0].startsWith('192.168')){
                        setGlassesIp(ip[0]);
                        addLog(`IP from BLE: ${ip[0]}`);
                        // Try fetch immediately
                        try{
                          const res = await fetch(`http://${ip[0]}/api/media/list`);
                          const json = await res.json();
                          const arr = Array.isArray(json) ? json : (json.media || []);
                          if(arr.length>0){ setMedia(arr); setStatus(`✓ ${arr.length} files from ${ip[0]}`); return; }
                        }catch{}
                      }
                    }
                  }catch{}
                }
              }
            }catch{}
          }
          setStatus('BLE connected • No IP in characteristics • Tap SCAN NETWORK');
        }catch(e){ setStatus('BLE err '+e.message); }
      }
    });
  };

  const fetchFromIp = async () => {
    if(!glassesIp){ Alert.alert('No IP','Tap SCAN NETWORK first'); return; }
    for(const ep of ['/api/media/list','/media/list','/api/v1/media/list']){
      try{
        addLog(`Fetch http://${glassesIp}${ep}`);
        const res = await fetch(`http://${glassesIp}${ep}`);
        const json = await res.json();
        const arr = Array.isArray(json) ? json : (json.media || json.data || []);
        setMedia(arr);
        setStatus(`✓ ${arr.length} files from ${glassesIp}`);
        if(arr.length>0) return;
      }catch(e){ addLog(`Fetch fail ${e.message.slice(0,40)}`); }
    }
  };

  const downloadFile = async (item) => {
    const name = item.name || item.fileName || item.toString();
    for(const ep of ['/api/media/download?name=','/media/file?name=']){
      try{
        const url = `http://${glassesIp}${ep}${encodeURIComponent(name)}`;
        addLog(`DL ${name}`);
        const local = FileSystem.documentDirectory + name;
        const {uri} = await FileSystem.downloadAsync(url, local);
        await MediaLibrary.saveToLibraryAsync(uri);
        setStatus(`✓ Saved ${name}`);
        return;
      }catch(e){}
    }
  };

  return(
    <SafeAreaView style={{flex:1,backgroundColor:'#000',padding:14}}>
      <Text style={{color:'#fff',fontSize:22,fontWeight:'900'}}>Glass Transfer</Text>
      <Text style={{color:'#00ff88',fontSize:10,fontWeight:'800'}}>V4 FINAL • VM8525306 Ready • RB Meta 01BJ</Text>
      <View style={{backgroundColor:'#111',borderWidth:1,borderColor:'#222',padding:12,borderRadius:12,marginTop:8}}><Text style={{color:'#fff',fontSize:11}}>{status}</Text>{glassesIp ? <Text style={{color:'#0af',fontSize:11,marginTop:4}}>Glasses IP: {glassesIp} on VM8525306</Text> : null}</View>
      
      <TouchableOpacity onPress={connectBleAndGetIp} style={{backgroundColor:'#222',padding:12,borderRadius:12,marginTop:8,borderWidth:1,borderColor:'#333',alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'700',fontSize:11}}>1. CONNECT BLE TO GET GLASSES IP</Text></TouchableOpacity>
      <TouchableOpacity onPress={scanLocalNetwork} style={{backgroundColor:'#fff',padding:14,borderRadius:16,marginTop:8,alignItems:'center'}}><Text style={{color:'#000',fontWeight:'900',fontSize:12}}>{scanning ? 'SCANNING VM8525306...' : '2. SCAN VM8525306 NETWORK FOR GLASSES'}</Text></TouchableOpacity>
      <TouchableOpacity onPress={fetchFromIp} style={{backgroundColor:'#00ff88',padding:12,borderRadius:12,marginTop:8,alignItems:'center'}}><Text style={{color:'#000',fontWeight:'900',fontSize:12}}>3. FETCH GALLERY</Text></TouchableOpacity>

      {media.length>0 && <><Text style={{color:'#fff',fontWeight:'700',fontSize:12,marginTop:10}}>In Glasses ({media.length})</Text><FlatList data={media} numColumns={2} keyExtractor={(i,idx)=>(i.name||i)+idx} renderItem={({item})=>{ const n=item.name||item.toString(); return <TouchableOpacity onPress={()=>downloadFile(item)} style={{flex:1,backgroundColor:'#111',margin:4,padding:10,borderRadius:10,borderWidth:1,borderColor:'#222'}}><Text style={{color:'#fff',fontSize:9}} numberOfLines={1}>{n}</Text><Text style={{color:'#0af',fontSize:8,marginTop:4,fontWeight:'800'}}>DOWNLOAD</Text></TouchableOpacity>}} style={{maxHeight:300,marginTop:6}} /></>}

      <ScrollView style={{marginTop:8,flex:1}}>{logs.map((l,i)=><Text key={i} style={{color:'#444',fontSize:8}}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  )
}
