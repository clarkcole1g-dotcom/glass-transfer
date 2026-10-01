
import React, {useState, useEffect} from 'react';
import {SafeAreaView, Text, TouchableOpacity, PermissionsAndroid, Platform, ScrollView, FlatList, Image, Alert, TextInput} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const GLASSES_IP = 'http://192.168.4.1';

export default function App(){
  const [status,setStatus] = useState('Step 1: Connect glasses via BLE to force WiFi ON');
  const [logs,setLogs] = useState([]);
  const [media,setMedia] = useState([]);
  const [homeWifis,setHomeWifis] = useState([]);
  const [downloading,setDownloading] = useState(null);
  const addLog = (m) => setLogs(prev=>[m,...prev].slice(0,40));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]);
      const {status} = await MediaLibrary.requestPermissionsAsync();
      addLog('Media perm: '+status);
    }
  };

  useEffect(()=>{ askPerms(); loadHomeWifis(); },[]);

  const loadHomeWifis = async () => {
    try{
      const list = await WifiManager.loadWifiList();
      const filtered = list.filter(w=> !w.SSID.includes('Glasses') && !w.SSID.includes('Ray-Ban') && w.SSID.length>0);
      setHomeWifis(filtered.slice(0,15));
      addLog('Found '+filtered.length+' home wifis');
    }catch(e){ addLog('loadWifi err '+e.message); }
  };

  const connectForceWifiAndFetch = async () => {
    await askPerms();
    setStatus('Scanning BLE for RW4009...');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err){ setStatus(err.message); return; }
      if(device?.name && (device.name.includes('Ray-Ban') || device.name.includes('Glasses') || device.name.includes('RW') || device.name.includes('Stories'))){
        manager.stopDeviceScan();
        setStatus(`Found ${device.name} - sending WiFi ON via BLE...`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          for(const cmd of ['AQ==','V0lGSV9PTg==']){
            try{ await dev.writeCharacteristicWithResponseForService(UART_SERVICE, UART_TX, cmd); }catch{}
          }
          setStatus('Command sent - looking for Glasses_XXXX WiFi...');
          // Scan for glasses wifi
          for(let i=0;i<8;i++){
            await new Promise(r=>setTimeout(r,2000));
            try{
              const list = await WifiManager.loadWifiList();
              const ray = list.find(n=> n.SSID && (n.SSID.includes('Glasses')||n.SSID.includes('Ray-Ban')));
              if(ray){
                setStatus(`Found ${ray.SSID} - connecting...`);
                await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
                await new Promise(r=>setTimeout(r,2500));
                // Fetch media list
                setStatus('Connected to glasses! Fetching photos/videos...');
                const res = await fetch(`${GLASSES_IP}/media/list`);
                const json = await res.json();
                // json is usually array of {name, size, etc}
                setMedia(Array.isArray(json)? json : json.media || []);
                setStatus(`Found ${json.length || json.media?.length || 0} files - tap to download`);
                addLog('Media list ok');
                return;
              }
            }catch(e){}
          }
          setStatus('Glasses WiFi ON but Android hid it. Go to Settings>WiFi manually pick Glasses_XXXX then come back and tap FETCH MEDIA');
        }catch(e){ setStatus('BLE error '+e.message); }
      }
    });
  };

  const fetchMediaOnly = async () => {
    try{
      setStatus('Fetching from '+GLASSES_IP);
      const res = await fetch(`${GLASSES_IP}/media/list`);
      const json = await res.json();
      setMedia(Array.isArray(json)? json : json.media || []);
      setStatus(`Found ${json.length} files`);
    }catch(e){ setStatus('Fetch failed - are you on Glasses_XXXX WiFi? '+e.message); }
  };

  const downloadFile = async (item) => {
    const fileName = item.name || item.fileName || item;
    setDownloading(fileName);
    try{
      const url = `${GLASSES_IP}/media/file?name=${encodeURIComponent(fileName)}`;
      const localUri = FileSystem.documentDirectory + fileName;
      addLog('Downloading '+url);
      const {uri} = await FileSystem.downloadAsync(url, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', fileName+' saved to Gallery!');
      setStatus(fileName+' saved to your Gallery!');
    }catch(e){
      Alert.alert('Download failed', e.message);
      addLog('dl err '+e.message);
    }
    setDownloading(null);
  };

  const connectHomeWifi = async (ssid) => {
    Alert.prompt('WiFi Password', `Password for ${ssid}`, async (pwd)=>{
      try{
        await WifiManager.connectToProtectedSSID(ssid, pwd, false, false);
        setStatus(`Switched back to ${ssid} - you have internet again`);
        addLog('Connected to home '+ssid);
      }catch(e){ Alert.alert('Failed', e.message); }
    });
  };

  return(
    <SafeAreaView style={{flex:1,backgroundColor:'#000',padding:12}}>
      <Text style={{color:'#fff',fontWeight:'bold',marginBottom:8}}>{status}</Text>
      
      <TouchableOpacity onPress={connectForceWifiAndFetch} style={{backgroundColor:'#fff',padding:14,borderRadius:10,marginBottom:6}}>
        <Text style={{textAlign:'center',fontWeight:'bold'}}>1. CONNECT & FORCE WIFI ON (BLE)</Text>
      </TouchableOpacity>
      
      <TouchableOpacity onPress={fetchMediaOnly} style={{backgroundColor:'#333',padding:10,borderRadius:10,marginBottom:6, borderWidth:1, borderColor:'#555'}}>
        <Text style={{textAlign:'center',color:'#fff'}}>2. FETCH MEDIA LIST (if already on Glasses WiFi)</Text>
      </TouchableOpacity>

      {media.length>0 && (
        <>
          <Text style={{color:'#0f0',marginVertical:6}}>Photos/Videos in glasses ({media.length}):</Text>
          <FlatList
            data={media}
            keyExtractor={(item,i)=> (item.name||item)+i}
            style={{maxHeight:250, backgroundColor:'#111', borderRadius:8}}
            renderItem={({item})=>{
              const name = item.name || item.fileName || item.toString();
              return(
                <TouchableOpacity onPress={()=>downloadFile(item)} style={{padding:10, borderBottomWidth:1, borderColor:'#222', flexDirection:'row', justifyContent:'space-between'}}>
                  <Text style={{color:'#fff', flex:1}} numberOfLines={1}>{name}</Text>
                  <Text style={{color: downloading===name ? '#ff0':'#0af', fontWeight:'bold'}}>{downloading===name ? 'DOWNLOADING...':'DOWNLOAD'}</Text>
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity onPress={async()=>{
            for(const m of media){ await downloadFile(m); }
          }} style={{backgroundColor:'#0a5',padding:12,borderRadius:10,marginTop:6}}>
            <Text style={{textAlign:'center',fontWeight:'bold',color:'#fff'}}>DOWNLOAD ALL TO GALLERY</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={{color:'#888',marginTop:12, fontWeight:'bold'}}>Your WiFi networks (tap to switch back after download):</Text>
      <TouchableOpacity onPress={loadHomeWifis} style={{padding:6}}><Text style={{color:'#0af'}}>Refresh WiFi list</Text></TouchableOpacity>
      <ScrollView style={{maxHeight:120, backgroundColor:'#111', borderRadius:8, marginTop:4}}>
        {homeWifis.map((w,i)=>(
          <TouchableOpacity key={i} onPress={()=>connectHomeWifi(w.SSID)} style={{padding:8, borderBottomWidth:1, borderColor:'#222'}}>
            <Text style={{color:'#fff'}}>{w.SSID} ({w.level}dBm)</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{marginTop:8}}>
        {logs.map((l,i)=><Text key={i} style={{color:'#555',fontSize:10}}>{l}</Text>)}
      </ScrollView>
    </SafeAreaView>
  )
}
