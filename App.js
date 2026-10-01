
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Alert, ScrollView, StyleSheet, StatusBar} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const GLASSES_IP = 'http://192.168.4.1';

export default function App(){
  const [status,setStatus] = useState('Ready • Unpaired in Bluetooth settings = correct');
  const [logs,setLogs] = useState([]);
  const [media,setMedia] = useState([]);
  const [homeWifis,setHomeWifis] = useState([]);
  const [connected,setConnected] = useState(false);
  const [downloading,setDownloading] = useState(null);
  const [downloaded,setDownloaded] = useState({});
  const addLog = (m) => setLogs(prev=>[m,...prev].slice(0,30));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]);
      const {status} = await MediaLibrary.requestPermissionsAsync();
    }
  };

  useEffect(()=>{ askPerms(); loadHomeWifis(); },[]);

  const loadHomeWifis = async () => {
    try{
      const list = await WifiManager.loadWifiList();
      const filtered = list.filter(w=> w.SSID && !w.SSID.includes('Glasses') && !w.SSID.includes('Ray-Ban') && w.SSID.length>0);
      setHomeWifis(filtered.slice(0,12));
    }catch(e){ addLog('WiFi scan err '+e.message); }
  };

  const connectForceWifiAndFetch = async () => {
    await askPerms();
    setStatus('Scanning BLE for RW4009...');
    addLog('BLE scan start');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err){ setStatus(err.message); return; }
      if(device?.name && (device.name.includes('Ray-Ban') || device.name.includes('Glasses') || device.name.includes('RW') || device.name.includes('Stories'))){
        manager.stopDeviceScan();
        setStatus(`Found ${device.name} • Sending WiFi ON`);
        addLog(`Found ${device.name}`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          for(const cmd of ['AQ==','V0lGSV9PTg==']){
            try{ await dev.writeCharacteristicWithResponseForService(UART_SERVICE, UART_TX, cmd); addLog('Sent '+cmd); }catch{}
          }
          setConnected(true);
          setStatus('Hotspot ON for 90s • Searching Glasses_XXXX...');
          for(let i=0;i<8;i++){
            await new Promise(r=>setTimeout(r,2000));
            try{
              const list = await WifiManager.loadWifiList();
              const ray = list.find(n=> n.SSID && (n.SSID.includes('Glasses')||n.SSID.includes('Ray-Ban')));
              if(ray){
                addLog('Found WiFi '+ray.SSID);
                setStatus(`Found ${ray.SSID} • Auto-connecting...`);
                await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
                await new Promise(r=>setTimeout(r,2500));
                const res = await fetch(`${GLASSES_IP}/media/list`);
                const json = await res.json();
                const arr = Array.isArray(json)? json : (json.media || json.files || []);
                setMedia(arr);
                setStatus(`✓ Connected • ${arr.length} photos/videos found`);
                addLog(`Media: ${arr.length} files`);
                return;
              }
            }catch(e){ addLog('scan '+e.message); }
          }
          setStatus('Hotspot ON • Check WiFi settings for Glasses_XXXX then tap Fetch');
        }catch(e){ setStatus('BLE error '+e.message); }
      }
    });
  };

  const fetchOnly = async () => {
    try{
      const res = await fetch(`${GLASSES_IP}/media/list`);
      const json = await res.json();
      const arr = Array.isArray(json)? json : (json.media || []);
      setMedia(arr);
      setStatus(`${arr.length} files • Tap to download`);
    }catch(e){ setStatus('Not on Glasses WiFi • '+e.message); }
  };

  const downloadFile = async (item) => {
    const fileName = item.name || item.fileName || item.path || item.toString();
    setDownloading(fileName);
    try{
      const url = `${GLASSES_IP}/media/file?name=${encodeURIComponent(fileName)}`;
      const localUri = FileSystem.documentDirectory + fileName;
      const {uri} = await FileSystem.downloadAsync(url, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      setDownloaded(prev=>({...prev,[fileName]:true}));
      setStatus(`✓ ${fileName} saved to Gallery`);
    }catch(e){ Alert.alert('Failed', e.message); addLog('dl '+e.message); }
    setDownloading(null);
  };

  const connectHome = async (ssid) => {
    Alert.prompt('Password', `Enter password for ${ssid}`, async (pwd)=>{
      try{
        await WifiManager.connectToProtectedSSID(ssid, pwd, false, false);
        setStatus(`Switched to ${ssid} • Internet restored`);
      }catch(e){ Alert.alert('Failed', e.message); }
    });
  };

  const renderItem = ({item}) => {
    const name = item.name || item.fileName || item.path || item.toString();
    const isVideo = name.toLowerCase().endsWith('.mp4');
    const isDownloaded = downloaded[name];
    const isDownloading = downloading===name;
    return(
      <TouchableOpacity onPress={()=>downloadFile(item)} style={styles.gridItem}>
        <View style={[styles.thumb, {backgroundColor: isVideo ? '#1a1a2e' : '#111'}]}>
          <Text style={styles.thumbIcon}>{isVideo ? '▶' : '◉'}</Text>
          <Text style={styles.badge}>{isVideo ? 'VIDEO' : 'PHOTO'}</Text>
          {isDownloaded && <View style={styles.check}><Text style={{color:'#fff',fontWeight:'bold'}}>✓</Text></View>}
        </View>
        <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
        <Text style={styles.fileAction}>{isDownloaded ? 'SAVED' : isDownloading ? '...' : 'DOWNLOAD'}</Text>
      </TouchableOpacity>
    );
  };

  return(
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.header}>
        <View style={styles.pill}><View style={[styles.dot, {backgroundColor: connected ? '#00ff88' : '#666'}]} /><Text style={styles.pillText}>{connected ? 'Connected to Glasses' : 'Disconnected'}</Text></View>
        <Text style={styles.title}>Glass Transfer</Text>
        <Text style={styles.subtitle}>RW4009 • Ray-Ban Stories</Text>
      </View>

      <View style={styles.statusCard}><Text style={styles.statusText}>{status}</Text></View>

      <TouchableOpacity onPress={connectForceWifiAndFetch} style={styles.heroBtn}>
        <Text style={styles.heroBtnText}>CONNECT & FORCE WIFI ON</Text>
        <Text style={styles.heroBtnSub}>BLE → WiFi hotspot • Then auto-fetch</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={fetchOnly} style={styles.secondaryBtn}><Text style={styles.secondaryText}>FETCH MEDIA LIST (if already on Glasses_XXXX)</Text></TouchableOpacity>

      {media.length>0 && (
        <>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>In Glasses ({media.length})</Text><TouchableOpacity onPress={async()=>{ for(const m of media) await downloadFile(m); }}><Text style={styles.downloadAll}>DOWNLOAD ALL</Text></TouchableOpacity></View>
          <FlatList data={media} numColumns={2} keyExtractor={(i,idx)=> (i.name||i)+idx} renderItem={renderItem} style={styles.grid} columnWrapperStyle={{gap:12}} contentContainerStyle={{gap:12, paddingBottom:12}} />
        </>
      )}

      <View style={styles.wifiSection}>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your WiFi • Tap to switch back</Text><TouchableOpacity onPress={loadHomeWifis}><Text style={styles.refresh}>Refresh</Text></TouchableOpacity></View>
        <ScrollView style={{maxHeight:140}}>
          {homeWifis.map((w,i)=>(
            <TouchableOpacity key={i} onPress={()=>connectHome(w.SSID)} style={styles.wifiRow}><View style={styles.wifiIcon}><Text>⌇</Text></View><Text style={styles.wifiName}>{w.SSID}</Text><Text style={styles.wifiDbm}>{w.level}dBm</Text></TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.logBox}>{logs.map((l,i)=><Text key={i} style={styles.logText}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#000',padding:16},
  header:{marginBottom:12},
  pill:{flexDirection:'row',alignItems:'center',backgroundColor:'#111',alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:5,borderRadius:20,marginBottom:8,borderWidth:1,borderColor:'#222'},
  dot:{width:8,height:8,borderRadius:4,marginRight:6},
  pillText:{color:'#aaa',fontSize:11,letterSpacing:0.5},
  title:{color:'#fff',fontSize:28,fontWeight:'800',letterSpacing:-0.5},
  subtitle:{color:'#666',fontSize:13,marginTop:2},
  statusCard:{backgroundColor:'#111',borderRadius:12,padding:12,borderWidth:1,borderColor:'#222',marginBottom:12},
  statusText:{color:'#fff',fontSize:13,fontWeight:'600'},
  heroBtn:{backgroundColor:'#fff',borderRadius:24,padding:18,alignItems:'center',marginBottom:8, shadowColor:'#fff', shadowOpacity:0.15, shadowRadius:20},
  heroBtnText:{color:'#000',fontWeight:'900',fontSize:15,letterSpacing:0.5},
  heroBtnSub:{color:'#666',fontSize:11,marginTop:4},
  secondaryBtn:{backgroundColor:'#111',borderRadius:12,padding:12,alignItems:'center',borderWidth:1,borderColor:'#222',marginBottom:12},
  secondaryText:{color:'#888',fontSize:11,fontWeight:'600'},
  sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8,marginTop:4},
  sectionTitle:{color:'#fff',fontWeight:'700',fontSize:13},
  downloadAll:{color:'#00ff88',fontWeight:'800',fontSize:12},
  refresh:{color:'#0af',fontSize:12},
  grid:{flexGrow:0},
  gridItem:{flex:1,backgroundColor:'#0a0a0a',borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:'#1a1a1a'},
  thumb:{height:110,justifyContent:'center',alignItems:'center'},
  thumbIcon:{fontSize:28,color:'#333'},
  badge:{position:'absolute',top:8,left:8,backgroundColor:'#000',color:'#fff',fontSize:9,paddingHorizontal:6,paddingVertical:3,borderRadius:6,fontWeight:'700'},
  check:{position:'absolute',top:8,right:8,backgroundColor:'#00c853',width:22,height:22,borderRadius:11,justifyContent:'center',alignItems:'center'},
  fileName:{color:'#fff',fontSize:11,paddingHorizontal:10,paddingTop:8},
  fileAction:{color:'#0af',fontSize:10,fontWeight:'800',paddingHorizontal:10,paddingBottom:10,paddingTop:4},
  wifiSection:{backgroundColor:'#0a0a0a',borderRadius:16,padding:12,borderWidth:1,borderColor:'#1a1a1a',marginTop:12},
  wifiRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#111'},
  wifiIcon:{width:28,height:28,backgroundColor:'#111',borderRadius:8,justifyContent:'center',alignItems:'center',marginRight:10},
  wifiName:{color:'#fff',flex:1,fontSize:13},
  wifiDbm:{color:'#555',fontSize:11},
  logBox:{marginTop:12,flex:1},
  logText:{color:'#333',fontSize:9,marginBottom:2, fontFamily: Platform.OS==='android' ? 'monospace' : 'Menlo'}
});
