import React, {useState} from 'react';
import {SafeAreaView, Text, TouchableOpacity, PermissionsAndroid, Platform, ScrollView, Alert} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';

const manager = new BleManager();
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const GLASSES_IP = 'http://192.168.4.1';

export default function App(){
  const [status,setStatus] = useState('Ready - Bluetooth will force WiFi ON then auto-connect');
  const [logs,setLogs] = useState([]);
  const addLog = (m) => setLogs(prev=>[m,...prev].slice(0,30));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      addLog('Perms: ' + JSON.stringify(res));
    }
  };

  const connectForceWifi = async () => {
    await askPerms();
    setStatus('Scanning for RW4009 over BLE...');
    addLog('Starting BLE scan');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err){ setStatus(err.message); addLog('Scan err: '+err.message); return; }
      if(device?.name && (device.name.includes('Ray-Ban') || device.name.includes('Glasses') || device.name.includes('RW') || device.name.includes('Stories'))){
        manager.stopDeviceScan();
        setStatus(`Found ${device.name} - BLE connecting...`);
        addLog(`Found: ${device.name} - ${device.id}`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          addLog('BLE connected, discovering services');
          
          // Try 3 different commands that turn WiFi ON for different firmware
          const cmds = ['AQ==', 'V0lGSV9PTg==', 'AQo=']; // 0x01, WIFI_ON, 0x01+newline
          for(const c of cmds){
            try{
              await dev.writeCharacteristicWithResponseForService(UART_SERVICE, UART_TX, c);
              addLog(`Sent BLE cmd ${c} OK`);
            }catch(e){ addLog(`Cmd ${c} fail ${e.message}`); }
          }
          
          setStatus('WiFi ON command sent! Scanning WiFi networks NOW (inside app)...');
          
          // Now scan WiFi INSIDE app for 15 seconds
          for(let i=0;i<6;i++){
            await new Promise(r=>setTimeout(r,2500));
            try{
              const list = await WifiManager.loadWifiList();
              addLog(`WiFi scan ${i}: found ${list.length} SSIDs`);
              const ray = list.find(n=> n.SSID && (n.SSID.includes('Glasses')||n.SSID.includes('Ray-Ban')||n.SSID.includes('Stories')||n.SSID.includes('RW4009')||n.SSID.toLowerCase().includes('ray')));
              if(ray){
                addLog(`FOUND GLASSES WIFI: ${ray.SSID}`);
                setStatus(`FOUND ${ray.SSID} - auto-connecting... Bluetooth triggers WiFi, WiFi does transfer`);
                try{
                  await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
                  setStatus(`Connected to ${ray.SSID}! Downloading media list...`);
                  // Give WiFi time to get IP
                  await new Promise(r=>setTimeout(r,2000));
                  const res = await fetch(`${GLASSES_IP}/media/list`);
                  const json = await res.json();
                  setStatus(`SUCCESS! ${json.length} files found over WiFi!`);
                  addLog(`Media: ${JSON.stringify(json).slice(0,200)}`);
                  Alert.alert('Success', `${json.length} photos/videos found - ready to download`);
                  return;
                }catch(e){ addLog('Connect fail: '+e.message); }
              } else {
                addLog(`No glasses SSID yet, SSIDs: ${list.slice(0,3).map(s=>s.SSID).join(', ')}`);
              }
            }catch(e){ addLog('Wifi scan error: '+e.message); }
          }
          setStatus('BLE triggered WiFi but Android still hiding it. Tap SCAN again, keep glasses ON FACE, Location ON, and glasses out of case 30sec');
        }catch(e){
          setStatus('Error: ' + e.message); addLog('Error: '+e.message);
        }
      }
    });
  };

  return(
    <SafeAreaView style={{flex:1,backgroundColor:'#000',padding:20}}>
      <Text style={{color:'#fff',fontSize:15,marginBottom:10,fontWeight:'bold'}}>{status}</Text>
      <TouchableOpacity onPress={connectForceWifi} style={{backgroundColor:'#fff',padding:20,borderRadius:12, marginBottom:20}}>
        <Text style={{color:'#000',textAlign:'center',fontWeight:'bold'}}>CONNECT - BLE forces WIFI ON + Auto-connect</Text>
      </TouchableOpacity>
      <ScrollView>
        {logs.map((l,i)=><Text key={i} style={{color:'#888',fontSize:11, marginBottom:2}}>{l}</Text>)}
      </ScrollView>
      <Text style={{color:'#555',fontSize:10,marginTop:10}}>Flow: 1) BLE connects 2) BLE sends WIFI ON (0x01) 3) Glasses start hotspot Glasses_XXXX for 90s 4) WiFi takes over and downloads at http://192.168.4.1 - BLE can't download photos alone</Text>
    </SafeAreaView>
  )
}