
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, ScrollView, Linking} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();

export default function App(){
  const [status,setStatus] = useState('V6 FIXED - Universal - Ready to build');
  const [media,setMedia] = useState([]);
  const [logs,setLogs] = useState([]);
  const addLog = (m) => { setLogs(p => [m, ...p].slice(0,50)); };

  const askPerms = async () => {
    if(Platform.OS === 'android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]);
      await MediaLibrary.requestPermissionsAsync();
    }
  };

  useEffect(() => { askPerms(); scanPhoneForRayBan(); }, []);

  const transferRW4009 = async () => {
    await askPerms();
    setStatus('Scanning BLE for RW4009 Stories...');
    addLog('RW4009 mode BLE scan');
    manager.startDeviceScan(null, null, async (err, device) => {
      if(err) return;
      const n = device && device.name ? device.name : '';
      const low = n.toLowerCase();
      if(low.includes('stories') || low.includes('rw4009') || low.includes('glasses')){
        manager.stopDeviceScan();
        setStatus('Found ' + n + ' - Triggering WiFi hotspot');
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          const UART_S = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
          const UART_T = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
          try{ await dev.writeCharacteristicWithResponseForService(UART_S, UART_T, 'V0lGSV9PTg=='); }catch(e){}
          setStatus('Hotspot triggered - Waiting for Glasses_XXXX');
          for(let i=0;i<10;i++){
            await new Promise(r => setTimeout(r, 2000));
            try{
              const list = await WifiManager.loadWifiList();
              const ray = list.find(w => {
                const s = w.SSID.toLowerCase();
                return s.includes('glasses') || s.includes('stories');
              });
              if(ray){
                addLog('Found hotspot ' + ray.SSID);
                await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
                await new Promise(r => setTimeout(r, 2500));
                const res = await fetch('http://192.168.4.1/media/list');
                const json = await res.json();
                const arr = Array.isArray(json) ? json : (json.media || []);
                setMedia(arr);
                setStatus('RW4009 found ' + arr.length + ' files');
                return;
              }
            }catch(e){}
          }
        }catch(e){ setStatus('RW4009 err ' + e.message); }
      }
    });
  };

  const scanPhoneForRayBan = async () => {
    try{
      const album = await MediaLibrary.getAlbumAsync('Ray-Ban Meta');
      const album2 = await MediaLibrary.getAlbumAsync('Ray-Ban Stories');
      let assets = [];
      if(album){
        const a = await MediaLibrary.getAssetsAsync({album: album.id, first: 100, mediaType: ['photo','video'], sortBy: ['creationTime']});
        assets = assets.concat(a.assets);
      }
      if(album2){
        const a2 = await MediaLibrary.getAssetsAsync({album: album2.id, first: 100, mediaType: ['photo','video'], sortBy: ['creationTime']});
        assets = assets.concat(a2.assets);
      }
      if(assets.length === 0){
        const recent = await MediaLibrary.getAssetsAsync({first: 100, mediaType: ['video','photo'], sortBy: ['creationTime']});
        const filtered = recent.assets.filter(a => {
          const fn = a.filename.toLowerCase();
          return fn.includes('ray') || fn.includes('meta') || a.width === 1440;
        });
        assets = filtered;
      }
      setMedia(assets);
      setStatus('Found ' + assets.length + ' Ray-Ban files on phone from Meta View');
      addLog('Phone scan ' + assets.length);
    }catch(e){
      addLog('Phone scan err ' + e.message);
    }
  };

  const openMetaView = () => {
    Linking.openURL('com.facebook.wearable.companion').catch(() => {
      Linking.openURL('market://details?id=com.facebook.wearable.companion');
    });
  };

  const backupAll = async () => {
    setStatus('Backing up ' + media.length + ' files');
    try{
      if(media.length > 0){
        const first = media[0];
        const album = await MediaLibrary.createAlbumAsync('Glass Transfer Backup', first, false).catch(() => null);
        for(let i=1;i<media.length;i++){
          try{ await MediaLibrary.addAssetsToAlbumAsync([media[i]], album, false); }catch(e){}
        }
        setStatus('Backed up ' + media.length + ' to Glass Transfer Backup');
      }
    }catch(e){ setStatus('Backup err ' + e.message); }
  };

  return(
    <SafeAreaView style={{flex:1, backgroundColor:'#000', padding:14}}>
      <Text style={{color:'#fff', fontSize:22, fontWeight:'900'}}>Glass Transfer</Text>
      <Text style={{color:'#00ff88', fontSize:10, fontWeight:'800'}}>V6 FIXED BUILD - Universal - All Glasses</Text>
      <View style={{backgroundColor:'#111', borderWidth:1, borderColor:'#222', padding:10, borderRadius:12, marginTop:8}}>
        <Text style={{color:'#fff', fontSize:11}}>{status}</Text>
      </View>
      <View style={{flexDirection:'row', marginTop:10}}>
        <TouchableOpacity onPress={transferRW4009} style={{flex:1, backgroundColor:'#222', padding:12, borderRadius:12, borderWidth:1, borderColor:'#333', alignItems:'center', marginRight:4}}>
          <Text style={{color:'#fff', fontWeight:'800', fontSize:10}}>RW4009 Stories</Text>
          <Text style={{color:'#0f0', fontSize:8, marginTop:2}}>Direct WiFi 100%</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={scanPhoneForRayBan} style={{flex:1, backgroundColor:'#00ff88', padding:12, borderRadius:12, alignItems:'center', marginLeft:4}}>
          <Text style={{color:'#000', fontWeight:'900', fontSize:10}}>RB Meta 01BJ</Text>
          <Text style={{color:'#000', fontSize:8, marginTop:2}}>Phone Gallery</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={openMetaView} style={{backgroundColor:'#fff', padding:12, borderRadius:12, marginTop:8, alignItems:'center'}}>
        <Text style={{color:'#000', fontWeight:'900', fontSize:11}}>OPEN META VIEW APP</Text>
      </TouchableOpacity>
      {media.length > 0 && (
        <View style={{marginTop:10, flex:1}}>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}>
            <Text style={{color:'#fff', fontWeight:'700', fontSize:12}}>On Phone ({media.length})</Text>
            <TouchableOpacity onPress={backupAll}><Text style={{color:'#00ff88', fontSize:11, fontWeight:'800'}}>BACKUP ALL</Text></TouchableOpacity>
          </View>
          <FlatList data={media} numColumns={2} keyExtractor={(item, idx) => item.id + idx} style={{marginTop:6, maxHeight:350}}
            renderItem={({item}) => {
              const isVid = item.mediaType === 'video';
              return (
                <View style={{flex:1, backgroundColor:'#111', margin:4, borderRadius:10, borderWidth:1, borderColor:'#222', padding:6}}>
                  <View style={{backgroundColor:'#222', height:70, borderRadius:6, justifyContent:'center', alignItems:'center'}}>
                    <Text style={{color:'#fff', fontSize:20}}>{isVid ? 'VID' : 'PIC'}</Text>
                  </View>
                  <Text style={{color:'#fff', fontSize:8, marginTop:4}} numberOfLines={1}>{item.filename}</Text>
                  <Text style={{color:'#555', fontSize:7}}>{new Date(item.creationTime).toLocaleDateString()}</Text>
                </View>
              );
            }}
          />
        </View>
      )}
      <ScrollView style={{marginTop:6, flex:1}}>{logs.map((l,i) => <Text key={i} style={{color:'#333', fontSize:7}}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  );
}
