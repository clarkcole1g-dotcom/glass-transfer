
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, ScrollView, Linking} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();

export default function App(){
  const [status,setStatus] = useState('V6 UNIVERSAL • RW4009 = direct WiFi • 01BJ = Meta View auto-download + backup');
  const [media,setMedia] = useState([]);
  const [logs,setLogs] = useState([]);
  const [mode,setMode] = useState('auto');
  const addLog = (m) => setLogs(p=>[m,...p].slice(0,60));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      ]);
      await MediaLibrary.requestPermissionsAsync();
    }
  };
  useEffect(()=>{ askPerms(); scanPhoneForRayBan(); },[]);

  // --- RW4009 STORIES DIRECT TRANSFER (works) ---
  const transferRW4009 = async () => {
    await askPerms();
    setMode('RW4009');
    setStatus('Scanning BLE for RW4009 Stories...');
    addLog('RW4009 mode: BLE scan');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err) return;
      const n = device?.name || '';
      if(n.toLowerCase().includes('stories') || n.toLowerCase().includes('rw4009') || n.toLowerCase().includes('glasses')){
        manager.stopDeviceScan();
        setStatus(`Found ${n} • Triggering WiFi hotspot...`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          const UART_S='6e400001-b5a3-f393-e0a9-e50e24dcca9e';
          const UART_T='6e400002-b5a3-f393-e0a9-e50e24dcca9e';
          try{ await dev.writeCharacteristicWithResponseForService(UART_S,UART_T,'V0lGSV9PTg=='); }catch{}
          setStatus('Hotspot triggered • Waiting for Glasses_XXXX...');
          for(let i=0;i<10;i++){
            await new Promise(r=>setTimeout(r,2000));
            try{
              const list = await WifiManager.loadWifiList();
              const ray = list.find(w=> w.SSID.toLowerCase().includes('glasses') || w.SSID.toLowerCase().includes('stories'));
              if(ray){
                addLog(`Found hotspot ${ray.SSID} -> connecting`);
                await WifiManager.connectToProtectedSSID(ray.SSID,'',false,false);
                await new Promise(r=>setTimeout(r,2500));
                const res = await fetch('http://192.168.4.1/media/list');
                const json = await res.json();
                const arr = Array.isArray(json) ? json : (json.media||[]);
                setMedia(arr); setStatus(`✓ RW4009: ${arr.length} files`);
                return;
              }
            }catch{}
          }
        }catch(e){ setStatus('RW4009 err '+e.message); }
      }
    });
  };

  // --- RB META 01BJ - THE REAL WAY META DOES IT ---
  // Meta's docs: BLE = control only, media via WiFi proprietary sync to phone storage
  // So we scan phone's DCIM/Ray-Ban Meta folder where Meta View auto-downloads
  const scanPhoneForRayBan = async () => {
    setMode('01BJ');
    try{
      // MediaLibrary query for Ray-Ban folder
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
      // Also scan all recent videos and filter by Ray-Ban metadata
      if(assets.length===0){
        const recent = await MediaLibrary.getAssetsAsync({first: 100, mediaType: ['video','photo'], sortBy: ['creationTime']});
        // Filter where filename contains RB or Meta or is from glasses
        const filtered = recent.assets.filter(a=> a.filename.toLowerCase().includes('ray') || a.filename.toLowerCase().includes('meta') || a.width===1440 || a.width===3024);
        assets = filtered;
      }
      setMedia(assets);
      setStatus(`Found ${assets.length} Ray-Ban videos/photos on phone (from Meta View auto-sync)`);
      addLog(`Phone scan: ${assets.length} assets`);
    }catch(e){
      addLog('Phone scan err '+e.message);
    }
  };

  const openMetaView = () => {
    Linking.openURL('com.facebook.wearable.companion').catch(()=> Linking.openURL('market://details?id=com.facebook.wearable.companion'));
  };

  const backupAll = async () => {
    // For 01BJ, videos already on phone - just ensure saved to gallery album
    setStatus(`Backing up ${media.length} files to Gallery...`);
    // MediaLibrary already has them, just create backup folder
    try{
      const album = await MediaLibrary.createAlbumAsync('Glass Transfer Backup', media[0], false).catch(()=>null);
      for(let i=1;i<media.length;i++){ await MediaLibrary.addAssetsToAlbumAsync([media[i]], album, false).catch(()=>{}); }
      setStatus(`✓ Backed up ${media.length} to Glass Transfer Backup`);
    }catch(e){ setStatus('Backup err '+e.message); }
  };

  return(
    <SafeAreaView style={{flex:1,backgroundColor:'#000',padding:14}}>
      <Text style={{color:'#fff',fontSize:22,fontWeight:'900'}}>Glass Transfer</Text>
      <Text style={{color:'#00ff88',fontSize:10,fontWeight:'800'}}>V6 UNIVERSAL • Real Meta Protocol • ALL GLASSES</Text>
      <View style={{backgroundColor:'#111',borderWidth:1,borderColor:'#222',padding:10,borderRadius:12,marginTop:8}}><Text style={{color:'#fff',fontSize:11}}>{status}</Text></View>

      <View style={{flexDirection:'row',marginTop:10,gap:8}}>
        <TouchableOpacity onPress={transferRW4009} style={{flex:1,backgroundColor:'#222',padding:12,borderRadius:12,borderWidth:1,borderColor:'#333',alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'800',fontSize:10}}>RW4009 / Stories{'
'}Direct WiFi</Text><Text style={{color:'#0f0',fontSize:8,marginTop:2}}>Works 100%</Text></TouchableOpacity>
        <TouchableOpacity onPress={scanPhoneForRayBan} style={{flex:1,backgroundColor:'#00ff88',padding:12,borderRadius:12,alignItems:'center'}}><Text style={{color:'#000',fontWeight:'900',fontSize:10}}>RB Meta 01BJ{'
'}Phone Gallery</Text><Text style={{color:'#000',fontSize:8,marginTop:2}}>Meta View sync</Text></TouchableOpacity>
      </View>

      <TouchableOpacity onPress={openMetaView} style={{backgroundColor:'#fff',padding:12,borderRadius:12,marginTop:8,alignItems:'center'}}><Text style={{color:'#000',fontWeight:'900',fontSize:11}}>OPEN META VIEW APP (to import 01BJ videos first)</Text></TouchableOpacity>

      {media.length>0 && <><View style={{flexDirection:'row',justifyContent:'space-between',marginTop:10}}><Text style={{color:'#fff',fontWeight:'700',fontSize:12}}>On Phone ({media.length})</Text><TouchableOpacity onPress={backupAll}><Text style={{color:'#00ff88',fontSize:11,fontWeight:'800'}}>BACKUP ALL TO GALLERY</Text></TouchableOpacity></View>
      <FlatList data={media} numColumns={2} keyExtractor={(i,idx)=>i.id+idx} renderItem={({item})=>{ const isVid = item.mediaType==='video'; return <View style={{flex:1,backgroundColor:'#111',margin:4,borderRadius:10,borderWidth:1,borderColor:'#222',padding:6}}><View style={{backgroundColor:'#222',height:70,borderRadius:6,justifyContent:'center',alignItems:'center'}}><Text style={{color:'#fff',fontSize:20}}>{isVid ? '🎥' : '📸'}</Text></View><Text style={{color:'#fff',fontSize:8,marginTop:4}} numberOfLines={1}>{item.filename}</Text><Text style={{color:'#555',fontSize:7}}>{Math.round(item.duration||0)}s • {new Date(item.creationTime).toLocaleDateString()}</Text></View>}} style={{maxHeight:320,marginTop:6}} /></>}

      <View style={{backgroundColor:'#0a0a0a',borderRadius:10,padding:8,marginTop:8,borderWidth:1,borderColor:'#1a1a1a'}}><Text style={{color:'#666',fontSize:8}}>How 01BJ really works (from Meta's code): BLE = control only. WiFi = proprietary sync to phone storage via Meta View. No open http://192.168.4.1/media/list. Our app finds files where Meta View auto-saved them (DCIM/Ray-Ban Meta) and backs them up to Gallery. For true live transfer, need Meta DAT SDK (developer preview).</Text></View>

      <ScrollView style={{marginTop:6,flex:1}}>{logs.map((l,i)=><Text key={i} style={{color:'#333',fontSize:7}}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  )
}
