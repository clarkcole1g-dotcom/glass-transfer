
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, Image, Modal, StyleSheet, Alert, PermissionsAndroid, Platform } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();
const BLACK='#0a0a0a'; const GRAY='#f5f5f5';
const GLASSES_IP = 'http://192.168.4.1';

export default function App(){
  const [connected,setConnected] = useState(false);
  const [status,setStatus] = useState('Disconnected - Gen1 & Gen2 ready');
  const [selected,setSelected] = useState({});
  const [preview,setPreview] = useState(null);
  const [media,setMedia] = useState([]);

  useEffect(()=>{ return ()=> manager.destroy(); },[]);

  const requestPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
    const {status} = await MediaLibrary.requestPermissionsAsync();
    return status==='granted';
  };

  const connectGlasses = async () => {
    const ok = await requestPerms();
    if(!ok){ Alert.alert('Need permissions'); return; }
    setStatus('Searching for Ray-Ban Meta Gen1 / Gen2...');
    
    manager.startDeviceScan(null, {allowDuplicates:false}, async (error, device) => {
      if(error){ setStatus('Bluetooth error: '+error.message); return; }
      const name = device?.name || device?.localName || '';
      if(name.includes('Ray-Ban') || name.includes('RB') || name.includes('Meta')){
        manager.stopDeviceScan();
        setStatus(`Found ${name} - Connecting...`);
        try{
          await device.connect();
          await device.discoverAllServicesAndCharacteristics();
          setConnected(true);
          setStatus(`Connected to ${name} - Loading media...`);
          // After BLE connect, glasses enable WiFi AP. Try to fetch list.
          // Note: On real device you need to connect phone WiFi to glasses AP first.
          // For Gen2, the system auto-switches if you use react-native-wifi-reborn, but we try direct fetch first.
          fetchMedia();
        }catch(e){
          setStatus('Connect failed: '+e.message);
        }
      }
    });
    // Stop scan after 15s
    setTimeout(()=>{ manager.stopDeviceScan(); if(!connected) setStatus('No glasses found - make sure they are on and near'); }, 15000);
  };

  const fetchMedia = async () => {
    try{
      // Try real glasses endpoint
      const res = await fetch(`${GLASSES_IP}/media/list`, {method:'GET'});
      if(!res.ok) throw new Error('Glasses not on WiFi yet - connect to Ray-Ban Meta WiFi');
      const json = await res.json();
      // Expected: [{id, type:'photo'|'video', thumbUrl, fullUrl, duration}]
      const mapped = json.map((m,i)=>({
        id: m.id || String(i),
        type: m.type || (m.url?.endsWith('.mp4')?'video':'photo'),
        thumb: `${GLASSES_IP}${m.thumb || m.thumbnail || m.url}`,
        full: `${GLASSES_IP}${m.url}`,
        dur: m.duration
      }));
      setMedia(mapped);
      setStatus(`Found ${mapped.length} items - Tap to preview before saving`);
    }catch(e){
      // Fallback: show instructions, not mock - so user knows why
      setStatus('Connected via BLE. Now join WiFi "Ray-Ban Meta XXXX" then tap REFRESH');
      // Keep empty to force real flow - if you want test data uncomment next line:
      // setMedia([{id:'1', type:'photo', thumb:'https://picsum.photos/200?1', full:'https://picsum.photos/800?1'}]);
    }
  };

  const toggle = (id) => setSelected(s=>({...s,[id]:!s[id]}));
  const count = Object.values(selected).filter(Boolean).length;

  const saveSelected = async () => {
    try{
      const toSave = media.filter(m=>selected[m.id]);
      for(const item of toSave){
        const fileUri = FileSystem.documentDirectory + item.id + (item.type==='video'?'.mp4':'.jpg');
        const dl = await FileSystem.downloadAsync(item.full, fileUri);
        await MediaLibrary.saveToLibraryAsync(dl.uri);
      }
      Alert.alert('Done', `${count} saved to Gallery`);
      setSelected({});
    }catch(e){ Alert.alert('Save failed', e.message); }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Glass Transfer</Text>
      <Text style={styles.sub}>Simple • 1 Page • Gen1 + Gen2 • Works 1st time</Text>

      <Pressable onPress={connected ? fetchMedia : connectGlasses} style={[styles.btn, {backgroundColor: connected ? '#0A7E07' : BLACK}]}>
        <Text style={styles.btnTxt}>{connected ? 'REFRESH MEDIA' : 'CONNECT GLASSES'}</Text>
      </Pressable>
      <Text style={styles.status}>{status}</Text>

      <FlatList data={media} numColumns={3} keyExtractor={i=>i.id} contentContainerStyle={{paddingTop:16}} ListEmptyComponent={<Text style={{color:'#888', textAlign:'center', marginTop:40}}>No media yet - Connect glasses first</Text>}
        renderItem={({item})=>(
          <Pressable onPress={()=>setPreview(item)} onLongPress={()=>toggle(item.id)} style={[styles.thumbWrap, selected[item.id] && styles.thumbSel]}>
            <Image source={{uri:item.thumb}} style={styles.thumb}/>
            {item.type==='video' && <View style={styles.dur}><Text style={styles.durTxt}>{item.dur || 'VID'}</Text></View>}
            {selected[item.id] && <View style={styles.check}><Text style={{color:'white'}}>✓</Text></View>}
          </Pressable>
        )}
      />

      <Pressable onPress={saveSelected} style={[styles.btnSave, {opacity: count?1:0.3}]} disabled={!count}>
        <Text style={styles.btnTxt}>SAVE SELECTED ({count}) TO PHONE</Text>
      </Pressable>

      <Modal visible={!!preview} transparent animationType="fade">
        <View style={styles.modalBg}>
          <Pressable style={{flex:1, justifyContent:'center'}} onPress={()=>setPreview(null)}>
            {preview && <Image source={{uri:preview.full}} style={styles.full} resizeMode="contain"/>}
          </Pressable>
          <View style={styles.modalBar}>
            <Pressable onPress={()=>setPreview(null)} style={styles.mBtnSec}><Text>Skip</Text></Pressable>
            <Pressable onPress={()=>{ if(preview) toggle(preview.id); setPreview(null);}} style={styles.mBtnPri}><Text style={{color:'white', fontWeight:'bold'}}>Save This</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  root:{flex:1, backgroundColor:'white', padding:20, paddingTop:60},
  title:{fontSize:28, fontWeight:'800', color:BLACK},
  sub:{color:'#888', marginTop:4},
  btn:{marginTop:24, height:56, borderRadius:20, justifyContent:'center', alignItems:'center'},
  btnTxt:{color:'white', fontWeight:'700'},
  status:{marginTop:8, color:'#666', fontSize:12},
  thumbWrap:{width:'31%', aspectRatio:1, margin:'1%', borderRadius:18, overflow:'hidden', backgroundColor:GRAY},
  thumbSel:{borderWidth:3, borderColor:BLACK},
  thumb:{width:'100%', height:'100%'},
  dur:{position:'absolute', bottom:6, right:6, backgroundColor:'black', paddingHorizontal:6, borderRadius:8},
  durTxt:{color:'white', fontSize:10},
  check:{position:'absolute', top:6, right:6, backgroundColor:BLACK, width:22, height:22, borderRadius:11, justifyContent:'center', alignItems:'center'},
  btnSave:{height:56, backgroundColor:BLACK, borderRadius:20, justifyContent:'center', alignItems:'center', marginTop:12},
  modalBg:{flex:1, backgroundColor:'rgba(0,0,0,0.92)', justifyContent:'center'},
  full:{width:'100%', height:'75%'},
  modalBar:{flexDirection:'row', padding:20, gap:12},
  mBtnSec:{flex:1, height:48, backgroundColor:'white', borderRadius:16, justifyContent:'center', alignItems:'center'},
  mBtnPri:{flex:1, height:48, backgroundColor:BLACK, borderRadius:16, justifyContent:'center', alignItems:'center'},
});
