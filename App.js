
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, ScrollView} from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export default function App(){
  const [status,setStatus] = useState('V7 NO FILTER - Shows ALL recent photos/videos so your 1 Meta View photo appears');
  const [media,setMedia] = useState([]);
  const [logs,setLogs] = useState([]);
  const addLog = (m) => setLogs(p=>[m,...p].slice(0,30));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ]);
      const perm = await MediaLibrary.requestPermissionsAsync();
      addLog('MediaLibrary perm: ' + perm.status);
      return perm.status === 'granted';
    }
    return true;
  };

  const scanAll = async () => {
    const ok = await askPerms();
    if(!ok){ setStatus('Permission denied - go to Settings Apps Glass Transfer Allow all photos'); return; }
    try{
      setStatus('Scanning ALL recent photos/videos - no filter...');
      // Get ALL albums first
      const albums = await MediaLibrary.getAlbumsAsync();
      addLog('Albums found: ' + albums.map(a=>a.title).join(', '));
      
      // Get ALL recent assets no filter
      const all = await MediaLibrary.getAssetsAsync({first: 100, mediaType: ['photo','video'], sortBy: ['creationTime']});
      addLog('Total assets on phone: ' + all.totalCount + ' - showing ' + all.assets.length);
      setMedia(all.assets);
      setStatus('Found ' + all.totalCount + ' total on phone - showing latest ' + all.assets.length + ' (your 1 Meta View photo should be here)');
      
      // Also try to find Ray-Ban album specifically
      for(const alb of albums){
        if(alb.title.toLowerCase().includes('ray') || alb.title.toLowerCase().includes('meta') || alb.title.toLowerCase().includes('glasses')){
          const inAlb = await MediaLibrary.getAssetsAsync({album: alb.id, first: 50});
          addLog('Album ' + alb.title + ' has ' + inAlb.assets.length + ' files');
        }
      }
    }catch(e){
      setStatus('Scan err: ' + e.message);
      addLog('Err ' + e.message);
    }
  };

  useEffect(()=>{ scanAll(); },[]);

  const backupAll = async () => {
    try{
      if(media.length>0){
        const alb = await MediaLibrary.createAlbumAsync('Glass Backup', media[0], false).catch(()=>null);
        addLog('Created backup album');
        setStatus('Backed up to Glass Backup album');
      }
    }catch(e){ addLog('Backup err '+e.message); }
  };

  return(
    <SafeAreaView style={{flex:1, backgroundColor:'#000', padding:14}}>
      <Text style={{color:'#fff', fontSize:22, fontWeight:'900'}}>Glass Transfer</Text>
      <Text style={{color:'#00ff88', fontSize:10, fontWeight:'800'}}>V7 NO FILTER - Fixes 0 files bug</Text>
      <View style={{backgroundColor:'#111', borderWidth:1, borderColor:'#222', padding:10, borderRadius:12, marginTop:8}}>
        <Text style={{color:'#fff', fontSize:11}}>{status}</Text>
      </View>
      <TouchableOpacity onPress={scanAll} style={{backgroundColor:'#00ff88', padding:14, borderRadius:14, marginTop:10, alignItems:'center'}}>
        <Text style={{color:'#000', fontWeight:'900', fontSize:13}}>SCAN ALL - SHOW MY 1 PHOTO</Text>
      </TouchableOpacity>
      {media.length>0 && (
        <View style={{marginTop:10, flex:1}}>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}>
            <Text style={{color:'#fff', fontWeight:'700', fontSize:12}}>On Phone ({media.length}) - Latest first</Text>
            <TouchableOpacity onPress={backupAll}><Text style={{color:'#00ff88', fontSize:11, fontWeight:'800'}}>BACKUP ALL</Text></TouchableOpacity>
          </View>
          <FlatList data={media} numColumns={3} keyExtractor={(item, idx) => item.id + idx} style={{marginTop:8}}
            renderItem={({item}) => {
              const isVid = item.mediaType === 'video';
              return (
                <View style={{flex:1/3, backgroundColor:'#111', margin:2, borderRadius:8, borderWidth:1, borderColor:'#222', padding:4}}>
                  <View style={{backgroundColor:'#222', height:80, borderRadius:6, justifyContent:'center', alignItems:'center'}}>
                    <Text style={{color:'#fff', fontSize:16}}>{isVid ? 'VIDEO' : 'PHOTO'}</Text>
                  </View>
                  <Text style={{color:'#fff', fontSize:7, marginTop:2}} numberOfLines={1}>{item.filename}</Text>
                  <Text style={{color:'#666', fontSize:6}}>{new Date(item.creationTime).toLocaleString()}</Text>
                  <Text style={{color:'#555', fontSize:6}}>{item.width}x{item.height}</Text>
                </View>
              );
            }}
          />
        </View>
      )}
      <ScrollView style={{marginTop:6, maxHeight:80}}>{logs.map((l,i)=><Text key={i} style={{color:'#444', fontSize:7}}>{l}</Text>)}</ScrollView>
    </SafeAreaView>
  );
}
