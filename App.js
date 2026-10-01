import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, Image, Modal, StyleSheet, Alert, PermissionsAndroid, Platform, ScrollView } from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const manager = new BleManager();
const BLACK='#000000'; const CARD='#121212'; const GRAY='#1e1e1e';

const GLASSES_IP = 'http://192.168.4.1';

export default function App(){
  const [connected,setConnected] = useState(false);
  const [status,setStatus] = useState('Disconnected - Gen1 & Gen2 ready');
  const [selected,setSelected] = useState({});
  const [preview,setPreview] = useState(null);
  const [media,setMedia] = useState([]);
  const [scanned,setScanned] = useState([]); // for debugging

  useEffect(()=>{ return ()=> manager.destroy(); },[]);

  const requestPerms = async () => {
    if(Platform.OS==='android'){
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      console.log(granted);
    }
    const {status} = await MediaLibrary.requestPermissionsAsync();
    if(status!=='granted') Alert.alert('Need gallery permission');
    return true;
  };

  const connectGlasses = async () => {
    await requestPerms();
    setScanned([]);
    setStatus('Searching... Make sure Meta View app is CLOSED and glasses LED flashing');

    const foundMap = new Map();

    manager.startDeviceScan(null, {allowDuplicates:false}, async (error, device) => {
      if(error){ setStatus('Bluetooth error: '+error.message); return; }
      const name = device?.name || device?.localName || 'NO NAME';
      const id = device.id;

      // Keep list of everything we see
      if(!foundMap.has(id)){
        foundMap.set(id, {id, name});
        setScanned(Array.from(foundMap.values()));
      }

      // MATCH: Ray-Ban, RB, Meta, Glasses, or even NO NAME with Meta manufacturer (we try all)
      const lower = name.toLowerCase();
      if(lower.includes('ray-ban') || lower.includes('ray ban') || lower.includes('meta') || lower.includes('glasses') || lower.includes('rb') || lower.includes('no name') || lower.includes('glass')){
        manager.stopDeviceScan();
        setStatus(`Found ${name} - Connecting...`);
        try{
          await device.connect();
          await device.discoverAllServicesAndCharacteristics();
          setConnected(true);
          setStatus(`BLE Connected to ${name}. Now connect phone WiFi to "${name}" WiFi in Settings → WiFi, then tap REFRESH`);
        }catch(e){
          setStatus('Connect failed: '+e.message+' - Try forgetting glasses in Bluetooth settings');
        }
      }
    });

    setTimeout(()=>{
      manager.stopDeviceScan();
      if(!connected && foundMap.size===0) setStatus('No glasses found - Hold case button 7 sec till light pulses BLUE, and FORCE STOP Meta View app');
      if(!connected && foundMap.size>0) setStatus(`Found ${foundMap.size} devices nearby (see list). Tap one to connect`);
    }, 15000);
  };

  const connectToScanned = async (devInfo) => {
    try{
      setStatus(`Connecting to ${devInfo.name}...`);
      const device = await manager.connectToDevice(devInfo.id);
      await device.discoverAllServicesAndCharacteristics();
      setConnected(true);
      setStatus(`Connected to ${devInfo.name}. Now join its WiFi AP "Ray-Ban Meta..." in phone WiFi settings, then tap REFRESH`);
    }catch(e){ setStatus('Failed: '+e.message); }
  };

  const fetchMedia = async () => {
    try{
      setStatus('Trying '+GLASSES_IP+'/media/list - Make sure you are on glasses WiFi...');
      const res = await fetch(`${GLASSES_IP}/media/list`, {method:'GET'});
      if(!res.ok) throw new Error('Not on glasses WiFi');
      const json = await res.json();
      const mapped = json.map((m,i)=>({
        id: m.id || String(i),
        type: m.type || (m.url?.endsWith('.mp4')?'video':'photo'),
        thumb: `${GLASSES_IP}${m.thumb || m.thumbnail || m.url}`,
        full: `${GLASSES_IP}${m.url}`,
        dur: m.duration
      }));
      setMedia(mapped);
      setStatus(`Found ${mapped.length} items`);
    }catch(e){
      setStatus('BLE OK. To see media: 1) Go to Phone Settings → WiFi → Connect to "Ray-Ban Meta XXXX" → 2) Come back → Tap REFRESH');
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
      <Text style={styles.sub}>Clean • Dark • Gen1 + Gen2 • S25 Ultra</Text>

      <Pressable onPress={connected? fetchMedia : connectGlasses} style={[styles.btn, {backgroundColor: connected? '#1DB954' : '#FFFFFF'}]}>
        <Text style={[styles.btnTxt, {color: connected? 'white' : BLACK}]}>{connected? 'REFRESH MEDIA' : 'CONNECT GLASSES'}</Text>
      </Pressable>
      <Text style={styles.status}>{status}</Text>

      {/* DEBUG LIST - shows everything found */}
      {scanned.length>0 &&!connected && (
        <View style={{marginTop:12}}>
          <Text style={{color:'#888', fontSize:12, marginBottom:6}}>Found nearby (tap to connect):</Text>
          {scanned.map(d=>(
            <Pressable key={d.id} onPress={()=>connectToScanned(d)} style={{backgroundColor:CARD, padding:12, borderRadius:12, marginBottom:6}}>
              <Text style={{color:'white', fontWeight:'600'}}>{d.name}</Text>
              <Text style={{color:'#666', fontSize:10}}>{d.id}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <FlatList data={media} numColumns={3} keyExtractor={i=>i.id} contentContainerStyle={{paddingTop:16}} ListEmptyComponent={<Text style={{color:'#555', textAlign:'center', marginTop:40}}>No media yet - Connect glasses first</Text>}
        renderItem={({item})=>(
          <Pressable onPress={()=>setPreview(item)} onLongPress={()=>toggle(item.id)} style={[styles.thumbWrap, selected[item.id] && styles.thumbSel]}>
            <Image source={{uri:item.thumb}} style={styles.thumb}/>
            {item.type==='video' && <View style={styles.dur}><Text style={styles.durTxt}>{item.dur || 'VID'}</Text></View>}
            {selected[item.id] && <View style={styles.check}><Text style={{color:'black'}}>✓</Text></View>}
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
  root:{flex:1, backgroundColor:BLACK, padding:20, paddingTop:60},
  title:{fontSize:28, fontWeight:'800', color:'white'},
  sub:{color:'#888', marginTop:4},
  btn:{marginTop:24, height:56, borderRadius:20, justifyContent:'center', alignItems:'center'},
  btnTxt:{color:'white', fontWeight:'700'},
  status:{marginTop:8, color:'#aaa', fontSize:12},
  thumbWrap:{width:'31%', aspectRatio:1, margin:'1%', borderRadius:18, overflow:'hidden', backgroundColor:GRAY},
  thumbSel:{borderWidth:3, borderColor:'white'},
  thumb:{width:'100%', height:'100%'},
  dur:{position:'absolute', bottom:6, right:6, backgroundColor:'black', paddingHorizontal:6, borderRadius:8},
  durTxt:{color:'white', fontSize:10},
  check:{position:'absolute', top:6, right:6, backgroundColor:'white', width:22, height:22, borderRadius:11, justifyContent:'center', alignItems:'center'},
  btnSave:{height:56, backgroundColor:'#FFFFFF', borderRadius:20, justifyContent:'center', alignItems:'center', marginTop:12},
  modalBg:{flex:1, backgroundColor:'rgba(0,0,0,0.92)', justifyContent:'center'},
  full:{width:'100%', height:'75%'},
  modalBar:{flexDirection:'row', padding:20, gap:12},
  mBtnSec:{flex:1, height:48, backgroundColor:'white', borderRadius:16, justifyContent:'center', alignItems:'center'},
  mBtnPri:{flex:1, height:48, backgroundColor:'#222', borderRadius:16, justifyContent:'center', alignItems:'center'},
});
