
import React, {useState, useEffect} from 'react';
import {SafeAreaView, View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Image} from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export default function App(){
  const [status,setStatus]=useState('V9 FIXED - Only META + All at once');
  const [metaOnly,setMetaOnly]=useState([]);
  
  const scan=async()=>{
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      ]);
      await MediaLibrary.requestPermissionsAsync();
    }
    try{
      setStatus('Scanning 1000 for META files...');
      const all=await MediaLibrary.getAssetsAsync({first:1000, mediaType:['photo','video'], sortBy:['creationTime']});
      const filtered=all.assets.filter(a=>{
        const w=a.width; const h=a.height;
        const isVideo = (w===2304 && h===1296) || (w===1296 && h===2304) || (w===1440 && h===1440);
        const isPhoto = (w===3000 && h===4000) || (w===4000 && h===3000) || (w===3024 && h===4032) || (w===4032 && h===3024);
        return isVideo || isPhoto;
      });
      setMetaOnly(filtered);
      setStatus('Found ' + filtered.length + ' META 01BJ files - ALL shown at once');
    }catch(e){ setStatus('Err '+e.message); }
  };
  
  useEffect(()=>{ scan(); },[]);
  
  const backup=async()=>{
    if(metaOnly.length===0) return;
    try{
      const album=await MediaLibrary.createAlbumAsync('Meta 01BJ All', metaOnly[0], false);
      for(let i=1;i<metaOnly.length;i++){
        try{ await MediaLibrary.addAssetsToAlbumAsync([metaOnly[i]], album, false); }catch(e){}
      }
      setStatus('Backed up '+metaOnly.length+' to Meta 01BJ All');
    }catch(e){ setStatus('Backup err '+e.message); }
  };
  
  return(
    <SafeAreaView style={{flex:1, backgroundColor:'#000', padding:12}}>
      <Text style={{color:'#fff', fontSize:22, fontWeight:'900'}}>Glass Transfer</Text>
      <Text style={{color:'#00ff88', fontSize:10, fontWeight:'800'}}>V9 FIXED - Only Meta + All at once</Text>
      <View style={{backgroundColor:'#111', borderWidth:1, borderColor:'#222', padding:10, borderRadius:12, marginTop:6}}>
        <Text style={{color:'#fff', fontSize:11}}>{status}</Text>
      </View>
      <View style={{flexDirection:'row', marginTop:8}}>
        <TouchableOpacity onPress={scan} style={{flex:1, backgroundColor:'#00ff88', padding:14, borderRadius:12, alignItems:'center', marginRight:4}}>
          <Text style={{color:'#000', fontWeight:'900', fontSize:11}}>SHOW ONLY META</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={backup} style={{flex:1, backgroundColor:'#fff', padding:14, borderRadius:12, alignItems:'center', marginLeft:4}}>
          <Text style={{color:'#000', fontWeight:'900', fontSize:11}}>BACKUP ALL ({metaOnly.length})</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={metaOnly} numColumns={2} keyExtractor={(item)=>item.id} style={{marginTop:10, flex:1}}
        renderItem={({item}) => (
          <View style={{flex:0.5, backgroundColor:'#111', margin:4, borderRadius:12, borderWidth:1, borderColor:'#00ff88', padding:5}}>
            <Image source={{uri:item.uri}} style={{height:130, borderRadius:8, backgroundColor:'#222'}} resizeMode="cover" />
            <Text style={{color:'#fff', fontSize:9, marginTop:4}} numberOfLines={1}>{item.filename}</Text>
            <Text style={{color:'#00ff88', fontSize:7}}>{item.width}x{item.height}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
