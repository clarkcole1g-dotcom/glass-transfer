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
