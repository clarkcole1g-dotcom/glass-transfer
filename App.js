import React, {useState} from 'react';
import {SafeAreaView, Text, TouchableOpacity, PermissionsAndroid, Platform, ScrollView} from 'react-native';
import {BleManager} from 'react-native-ble-plx';
import WifiManager from 'react-native-wifi-reborn';

const manager = new BleManager();
const UART_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const GLASSES_IP = 'http://192.168.4.1';

export default function App(){
  const [status,setStatus] = useState('Ready - Unpaired from Bluetooth settings = correct');
  const [logs,setLogs] = useState([]);

  const addLog = (m) => setLogs(prev=>[m,...prev].slice(0,20));

  const askPerms = async () => {
    if(Platform.OS==='android'){
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]);
    }
  };

  const connectForceWifi = async () => {
    await askPerms();
    setStatus('Scanning for your RW4009...');
    addLog('Scanning...');
    manager.startDeviceScan(null,null, async (err,device)=>{
      if(err){ setStatus(err.message); return; }
      if(device?.name && (device.name.includes('Ray-Ban') || device.name.includes('Glasses') || device.name.includes('RW') || device.name.includes('Stories'))){
        manager.stopDeviceScan();
        setStatus(`Found ${device.name} - Connecting...`);
        addLog(`Found: ${device.name}`);
        try{
          const dev = await device.connect();
          await dev.discoverAllServicesAndCharacteristics();
          setStatus('BLE OK - Sending WIFI ON command (this makes WiFi appear)...');
          addLog('BLE connected, sending ON command');
          try{
            await dev.writeCharacteristicWithResponseForService(UART_SERVICE, UART_TX, 'AQ=='); // 0x01
          }catch{}
          try{
            await dev.writeCharacteristicWithResponseForService(UART_SERVICE, UART_TX, 'V0lGSV9PTg=='); // WIFI_ON
          }catch{}
          
          setStatus('Command sent! Waiting 4 sec for hotspot to start...');
          await new Promise(r=>setTimeout(r,4000));

          try{
            const list = await WifiManager.loadWifiList();
            addLog(`WiFi scan found ${list.length} networks`);
            const ray = list.find(n=>n.SSID.includes('Ray-Ban')||n.SSID.includes('Glasses')||n.SSID.includes('Stories')||n.SSID.includes('RW'));
            if(ray){
              setStatus(`FOUND WIFI: ${ray.SSID} - Joining automatically...`);
              addLog(`Found ${ray.SSID}, joining...`);
              await WifiManager.connectToProtectedSSID(ray.SSID, '', false, false);
              setStatus(`Connected to ${ray.SSID}! Fetching media...`);
              const res = await fetch(`${GLASSES_IP}/media/list`);
              const json = await res.json();
              setStatus(`SUCCESS! ${json.length} photos/videos found - showing now`);
            } else {
              setStatus('Hotspot is ON but Android hid it. NOW go to Phone Settings > WiFi - you WILL see Glasses_XXXX at top (open, no password). Tap it, then come back here.');
              addLog('Hotspot on, but need manual tap in WiFi settings');
            }
          }catch(e){
            setStatus('Hotspot ON! Now open Settings > WiFi > Look at top list for Glasses_XXXX / Ray-Ban Stories - Tap to connect (says no internet = normal), then return to app');
          }
        }catch(e){
          setStatus('Error: ' + e.message);
        }
      }
    });
  };

  return(
    <SafeAreaView style={{flex:1,backgroundColor:'#000',padding:20}}>
      <Text style={{color:'#fff',fontSize:16,marginBottom:10,fontWeight:'bold'}}>{status}</Text>
      <TouchableOpacity onPress={connectForceWifi} style={{backgroundColor:'#fff',padding:20,borderRadius:12, marginBottom:20}}>
        <Text style={{color:'#000',textAlign:'center',fontWeight:'bold'}}>CONNECT & FORCE WIFI ON</Text>
      </TouchableOpacity>
      <ScrollView>
        {logs.map((l,i)=><Text key={i} style={{color:'#888',fontSize:12}}>{l}</Text>)}
      </ScrollView>
      <Text style={{color:'#555',fontSize:11,marginTop:10}}>Glasses must be OUT of case, on face, Location ON. Unpaired from Bluetooth settings = correct.</Text>
    </SafeAreaView>
  )
}
