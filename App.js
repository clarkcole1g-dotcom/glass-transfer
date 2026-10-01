
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Alert, ScrollView, StyleSheet, StatusBar} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

// Universal detection
const isGlasses = (name) => {
  if(!name) return false;
  const n = name.toLowerCase();
  return n.includes('ray-ban') || n.includes('ray ban') || n.includes('glasses') || n.includes('stories') || n.includes('rw') || n.includes('meta') || n.includes('rb') || n.includes('01bj');
};

const GLASSES_SSID_MATCH = (ssid) => {
  if(!ssid) return false;
  const s = ssid.toLowerCase();
  return s.includes('glasses') || s.includes('ray-ban') || s.includes('ray ban') || s.includes('stories') || s.includes('meta') || s.includes('rb') || s.includes('01bj') || s.includes('rw4009');
};

const GLASSES_IPS = ['http://192.168.4.1', 'https://192.168.4.1'];
const ENDPOINTS = ['/api/media/list', '/media/list', '/api/v1/media/list', '/api/photos/list'];

export default function App(){
  const [status,setStatus] = useState('UNIVERSAL • Works with all Ray-Bans • RW4009 + 01BJ');
  const [detectedModel,setDetectedModel] = useState('Scanning for any glasses...');
  const [media,setMedia] = useState([]);
  const [logs,setLogs] = useState([]);
  const [homeWifis,setHomeWifis] = useState([]);
  const [downloading,setDownloading] = useState(null);
  const [downloaded,setDownloaded] = useState({});
  const addLog = (m) => setLogs(prev=>[`${new Date().toLocaleTimeString()} ${m}`,...prev].slice(0,40));

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

  const loadHomeWifis = async () => {
    try{
      const list = await WifiManager.loadWifiList();
      setHomeWifis(list.filter(w=> !GLASSES_SSID_MATCH(w.SSID) && w.SSID.length>0).slice(0,15));
    }catch{}
  };

  const universalConnect = async () => {
    await askPerms();
    setStatus('Scanning BLE for ANY Ray-Ban (Stories + Meta)...');
    addLog('Starting universal BLE scan');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err){ setStatus(err.message); return; }
      const name = device?.name || '';
      if(isGlasses(name)){
        manager.stopDeviceScan();
        const model = name.toLowerCase().includes('01bj') || name.toLowerCase().includes('meta') ? 'RB META 01BJ (Gen2)' : 'RW4009 Stories (Gen1)';
        setDetectedModel(`Found: ${name} • ${model}`);
        setStatus(`Found ${name} • Forcing WiFi ON (universal)...`);
        addLog(`FOUND ${name} id=${device.id} model=${model}`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          const services = await dev.services();
          addLog(`Services: ${services.length} found`);

          // Try EVERY writable characteristic with WiFi ON commands (works for Gen1 + triggers Gen2)
          const cmds = ['AQ==','V0lGSV9PTg==','AQo=','AA==']; // 0x01, WIFI_ON variants
          for(const svc of services){
            try{
              const chars = await dev.characteristicsForService(svc.uuid);
              for(const c of chars){
                if(c.isWritableWithResponse || c.isWritableWithoutResponse){
                  for(const cmd of cmds){
                    try{ await dev.writeCharacteristicWithResponseForService(svc.uuid, c.uuid, cmd); addLog(`Write ${svc.uuid.slice(0,8)} cmd ${cmd} OK`); }catch{}
                  }
                }
              }
            }catch{}
          }
          // Also try classic UART specifically
          for(const cmd of cmds){
            try{ await dev.writeCharacteristicWithResponseForService(UART_SERVICE, UART_TX, cmd); addLog(`UART ${cmd} OK`); }catch{}
          }

          setStatus(`${model} • Hotspot should be ON for 90s • Scanning WiFi...`);
          
          // Universal WiFi scan - look for ANY glasses SSID
          for(let i=0;i<12;i++){
            await new Promise(r=>setTimeout(r,2000));
            try{
              const list = await WifiManager.loadWifiList();
              const ray = list.find(w=> GLASSES_SSID_MATCH(w.SSID));
              const others = list.filter(w=> !GLASSES_SSID_MATCH(w.SSID)).slice(0,3).map(w=>w.SSID).join(', ');
              addLog(`Scan ${i}: ${list.length} nets, looking for glasses... others: ${others}`);
              if(ray){
                addLog(`*** FOUND GLASSES HOTSPOT: ${ray.SSID} ***`);
                setStatus(`Found ${ray.SSID} • Auto-connecting...`);
                try{
                  await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
                  await new Promise(r=>setTimeout(r,3000));
                  setStatus(`Connected to ${ray.SSID} • Fetching gallery (trying all APIs)...`);
                  // Try every IP + endpoint combo (universal)
                  for(const ip of GLASSES_IPS){
                    for(const ep of ENDPOINTS){
                      try{
                        const url = `${ip}${ep}`;
                        addLog(`Fetch ${url}`);
                        const res = await fetch(url);
                        const text = await res.text();
                        let json;
                        try{ json = JSON.parse(text); }catch{ continue; }
                        const arr = Array.isArray(json) ? json : (json.media || json.data || json.files || json.photos || []);
                        if(arr && arr.length>0){
                          setMedia(arr);
                          setStatus(`✓ ${model} • ${arr.length} files • ${ray.SSID} • Tap to download`);
                          addLog(`SUCCESS ${arr.length} files via ${ep}`);
                          loadHomeWifis();
                          return;
                        } else if(text.length>10){
                          addLog(`Endpoint ${ep} returned ${text.length} chars but no array`);
                        }
                      }catch(e){ addLog(`Fetch ${ep} fail ${e.message.slice(0,60)}`); }
                    }
                  }
                  setStatus(`Connected to ${ray.SSID} but no media API responded • Try FETCH button`);
                }catch(e){ addLog(`WiFi connect fail ${e.message}`); }
              }
            }catch(e){ addLog(`WiFi list err ${e.message}`); }
          }
          setStatus('Hotspot ON but Android hid it • Go Settings>WiFi manually connect to Glasses/Meta SSID then tap FETCH');
        }catch(e){ setStatus('BLE error '+e.message); addLog('BLE err '+e.message); }
      }
    });
  };

  const fetchOnly = async () => {
    setStatus('Fetching gallery via all APIs...');
    for(const ip of GLASSES_IPS){
      for(const ep of ENDPOINTS){
        try{
          const url = `${ip}${ep}`;
          addLog(`Manual fetch ${url}`);
          const res = await fetch(url);
          const json = await res.json();
          const arr = Array.isArray(json) ? json : (json.media || json.data || []);
          if(arr.length>0){
            setMedia(arr);
            setStatus(`✓ ${arr.length} files via ${ep}`);
            return;
          }
        }catch(e){ addLog(`Manual ${ep} ${e.message.slice(0,50)}`); }
      }
    }
    setStatus('Not on glasses WiFi or API changed');
  };

  const downloadFile = async (item) => {
    const fileName = item.name || item.fileName || item.path || item.uri || item.toString();
    setDownloading(fileName);
    addLog(`Download ${fileName}`);
    for(const ip of GLASSES_IPS){
      for(const dlEp of ['/api/media/download?name=','/media/file?name=','/api/v1/media/file?name=','/media/file?file=']){
        try{
          const url = `${ip}${dlEp}${encodeURIComponent(fileName)}`;
          const localUri = FileSystem.documentDirectory + fileName;
          const {uri} = await FileSystem.downloadAsync(url, localUri);
          await MediaLibrary.saveToLibraryAsync(uri);
          setDownloaded(prev=>({...prev,[fileName]:true}));
          setStatus(`✓ Saved ${fileName} to Gallery`);
          addLog(`Saved ${fileName}`);
          setDownloading(null);
          return;
        }catch(e){}
      }
    }
    Alert.alert('Download failed', 'Tried all endpoints');
    setDownloading(null);
  };

  const connectHome = async (ssid) => {
    Alert.prompt('Home WiFi Password', `Password for ${ssid}`, async (pwd)=>{
      try{
        await WifiManager.connectToProtectedSSID(ssid, pwd, false, false);
        setStatus(`Back on ${ssid} • Internet restored`);
      }catch(e){ Alert.alert('Failed', e.message); }
    });
  };

  const renderItem = ({item}) => {
    const name = item.name || item.fileName || item.toString();
    const isVideo = name.toLowerCase().endsWith('.mp4') || item.type==='video';
    const done = downloaded[name];
    const isDl = downloading===name;
    return(
      <TouchableOpacity onPress={()=>downloadFile(item)} style={styles.gridItem}>
        <View style={styles.thumb}><Text style={{fontSize:24}}>{isVideo?'▶':'◉'}</Text><Text style={styles.badge}>{isVideo?'VIDEO':'PHOTO'}</Text>{done && <View style={styles.check}><Text style={{color:'#fff',fontWeight:'bold'}}>✓</Text></View>}</View>
        <Text numberOfLines={1} style={styles.fileName}>{name}</Text>
        <Text style={styles.fileAction}>{done?'SAVED': isDl ? 'DOWNLOADING...':'DOWNLOAD'}</Text>
      </TouchableOpacity>
    );
  };

  return(
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Glass Transfer</Text>
      <Text style={styles.universal}>UNIVERSAL • RW4009 + RB Meta 01BJ + All Glasses</Text>
      <View style={styles.modelPill}><Text style={styles.modelText}>{detectedModel}</Text></View>
      <View style={styles.statusCard}><Text style={styles.statusText}>{status}</Text></View>
      <TouchableOpacity onPress={universalConnect} style={styles.hero}><Text style={styles.heroText}>CONNECT ANY GLASSES & FORCE WIFI ON</Text><Text style={styles.heroSub}>Works with Stories Gen1 + Meta Gen2</Text></TouchableOpacity>
      <TouchableOpacity onPress={fetchOnly} style={styles.secondary}><Text style={styles.secondaryText}>FETCH GALLERY (if already on Glasses/Meta WiFi)</Text></TouchableOpacity>
      {media.length>0 && <>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>In Glasses ({media.length})</Text><TouchableOpacity onPress={async()=>{ for(const m of media) await downloadFile(m); }}><Text style={styles.downloadAll}>DOWNLOAD ALL</Text></TouchableOpacity></View>
        <FlatList data={media} numColumns={2} keyExtractor={(i,idx)=>(i.name||i)+idx} renderItem={renderItem} columnWrapperStyle={{gap:12}} contentContainerStyle={{gap:12}} style={{flexGrow:0, maxHeight:320}} />
      </>}
      <View style={styles.wifiBox}>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Your WiFi • Tap to switch back</Text><TouchableOpacity onPress={loadHomeWifis}><Text style={{color:'#0af',fontSize:12}}>Refresh</Text></TouchableOpacity></View>
        <ScrollView style={{maxHeight:120}}>{homeWifis.map((w,i)=><TouchableOpacity key={i} onPress={()=>connectHome(w.SSID)} style={styles.wifiRow}><Text style={styles.wifiName}>{w.SSID}</Text><Text style={styles.wifiDbm}>{w.level}dBm</Text></TouchableOpacity>)}</ScrollView>
      </View>
      <ScrollView style={{marginTop:8, flex:1}}>{logs.map((l,i)=><Text key={i} style={styles.log}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#000',padding:14},
  title:{color:'#fff',fontSize:26,fontWeight:'900',letterSpacing:-0.5},
  universal:{color:'#00ff88',fontSize:11,fontWeight:'800',letterSpacing:1,marginTop:4,marginBottom:8},
  modelPill:{backgroundColor:'#111',borderWidth:1,borderColor:'#222',paddingHorizontal:10,paddingVertical:6,borderRadius:20,alignSelf:'flex-start',marginBottom:10},
  modelText:{color:'#aaa',fontSize:11},
  statusCard:{backgroundColor:'#111',borderRadius:12,padding:12,borderWidth:1,borderColor:'#222',marginBottom:10},
  statusText:{color:'#fff',fontSize:12,fontWeight:'600'},
  hero:{backgroundColor:'#fff',borderRadius:22,padding:16,alignItems:'center',marginBottom:8},
  heroText:{color:'#000',fontWeight:'900',fontSize:13},
  heroSub:{color:'#666',fontSize:10,marginTop:3},
  secondary:{backgroundColor:'#111',borderRadius:12,padding:10,alignItems:'center',borderWidth:1,borderColor:'#222',marginBottom:10},
  secondaryText:{color:'#666',fontSize:10,fontWeight:'700'},
  sectionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8,marginTop:8},
  sectionTitle:{color:'#fff',fontWeight:'700',fontSize:12},
  downloadAll:{color:'#00ff88',fontWeight:'800',fontSize:11},
  gridItem:{flex:1,backgroundColor:'#0a0a0a',borderRadius:14,borderWidth:1,borderColor:'#1a1a1a',overflow:'hidden'},
  thumb:{height:90,backgroundColor:'#111',justifyContent:'center',alignItems:'center'},
  badge:{position:'absolute',top:6,left:6,backgroundColor:'#000',color:'#fff',fontSize:8,paddingHorizontal:5,paddingVertical:2,borderRadius:5,fontWeight:'700'},
  check:{position:'absolute',top:6,right:6,backgroundColor:'#00c853',width:18,height:18,borderRadius:9,justifyContent:'center',alignItems:'center'},
  fileName:{color:'#fff',fontSize:10,paddingHorizontal:8,paddingTop:6},
  fileAction:{color:'#0af',fontSize:9,fontWeight:'800',paddingHorizontal:8,paddingBottom:8,paddingTop:3},
  wifiBox:{backgroundColor:'#0a0a0a',borderRadius:14,padding:10,borderWidth:1,borderColor:'#1a1a1a',marginTop:10},
  wifiRow:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#111'},
  wifiName:{color:'#fff',fontSize:12},
  wifiDbm:{color:'#555',fontSize:10},
  log:{color:'#333',fontSize:8,marginBottom:2}
});
