import React, { useState, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Platform, TextInput, FlatList, Alert } from 'react-native';
import Colors from '../constants/Colors';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// Lazy-load MapView to avoid crashes in Expo Go
let MapView = null;
let Marker = null;
let PROVIDER_GOOGLE = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (e) {
  // Silent catch for Expo Go
}

import { WebView } from 'react-native-webview';

export default function MapModal({ visible, onClose, onConfirm, initialLocation }) {
  const isNative = Constants.appOwnership !== 'expo';
  const canShowNativeMap = isNative && MapView;

  const mapRef = useRef(null);
  const webViewRef = useRef(null);

  const [region, setRegion] = useState({
    latitude: initialLocation?.latitude || 17.3850,
    longitude: initialLocation?.longitude || 78.4867,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  const [marker, setMarker] = useState({
    latitude: initialLocation?.latitude || 17.3850,
    longitude: initialLocation?.longitude || 78.4867,
  });

  // Sync state whenever MapModal becomes visible or initialLocation updates
  React.useEffect(() => {
    if (visible && initialLocation) {
      const coords = {
        latitude: initialLocation.latitude || 17.3850,
        longitude: initialLocation.longitude || 78.4867,
      };
      setMarker(coords);
      setRegion({
        ...coords,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
      // Allow a small delay for both MapView and WebView Leaflet map to mount and be ready
      const timer = setTimeout(() => {
        webViewRef.current?.postMessage(JSON.stringify(coords));
        mapRef.current?.animateToRegion({
          ...coords,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 300);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [visible, initialLocation]);

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDEUqPA15poXPNybxUcDYiM3XdfoiJ_suk";

  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();
      if (data.status === 'OK' && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
    return '';
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Debounce Google API calls by 400ms to avoid bottlenecking requests
    const timeout = setTimeout(async () => {
      try {
        setIsSearching(true);
        // Bias suggestions within a 50km radius around Hyderabad (17.3850, 78.4867)
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}&components=country:in&location=17.3850,78.4867&radius=50000`
        );
        const data = await response.json();
        if (data.status === 'OK') {
          setSearchResults(data.predictions);
        } else {
          console.warn('Place autocomplete status not OK:', data.status, data.error_message);
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    setSearchTimeout(timeout);
  };

  const selectPlace = async (placeId) => {
    setSearchResults([]);
    setSearchQuery('');
    try {
      setLoadingLocation(true);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();
      if (data.status === 'OK') {
        const { lat, lng } = data.result.geometry.location;
        const newCoords = { latitude: lat, longitude: lng };
        setMarker(newCoords);
        setRegion({
          ...newCoords,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });

        // Synchronize Map Camera (Native & WebView Fallback)
        mapRef.current?.animateToRegion({
          ...newCoords,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);

        webViewRef.current?.postMessage(JSON.stringify(newCoords));
      }
    } catch (error) {
      console.error('Select place error:', error);
    } finally {
      setLoadingLocation(false);
    }
  };

  // Static HTML for Leaflet Map Fallback (decoupled from 'marker' state to prevent WebView reloads/flashing)
  const mapHtml = React.useMemo(() => {
    const initLat = initialLocation?.latitude || 17.3850;
    const initLng = initialLocation?.longitude || 78.4867;
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          .leaflet-control-attribution { display: none; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: false }).setView([${initLat}, ${initLng}], 15);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          var marker = L.marker([${initLat}, ${initLng}], {
            draggable: true
          }).addTo(map);

          marker.on('dragend', function(event) {
            var position = marker.getLatLng();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              latitude: position.lat,
              longitude: position.lng
            }));
          });

          map.on('click', function(e) {
            marker.setLatLng(e.latlng);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              latitude: e.latlng.lat,
              longitude: e.latlng.lng
            }));
          });

          function handleMessage(e) {
            try {
              var data = JSON.parse(e.data);
              if (data.latitude && data.longitude) {
                map.setView([data.latitude, data.longitude], 15);
                marker.setLatLng([data.latitude, data.longitude]);
              }
            } catch (err) {}
          }
          window.addEventListener('message', handleMessage);
          document.addEventListener('message', handleMessage);
        </script>
      </body>
    </html>
    `;
  }, [initialLocation?.latitude, initialLocation?.longitude]);

  const webViewSource = React.useMemo(() => ({ html: mapHtml }), [mapHtml]);

  const onWebMessage = (event) => {
    try {
      const coords = JSON.parse(event.nativeEvent.data);
      setMarker(coords);
    } catch (e) {
      console.error('Web Map Message Error:', e);
    }
  };

  const fetchCurrentLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied. Please enable it in system settings.');
        return;
      }

      // Robust fallback handling: 5-second timeout, falling back to getLastKnownPositionAsync
      let location = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          timeout: 5000,
        });
      } catch (err) {
        console.warn('[MAP] getCurrentPositionAsync failed/timeout, trying getLastKnownPositionAsync...', err);
        location = await Location.getLastKnownPositionAsync();
      }

      if (!location) {
        Alert.alert('Location Error', 'Could not retrieve current location. Please ensure GPS is active.');
        return;
      }
      
      const newCoords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setMarker(newCoords);
      setRegion({
        ...newCoords,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });

      // Synchronize Map Camera (Native & WebView Fallback)
      mapRef.current?.animateToRegion({
        ...newCoords,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 1000);

      webViewRef.current?.postMessage(JSON.stringify(newCoords));
    } catch (error) {
      console.error('Error fetching location:', error);
      Alert.alert('Location Error', 'Could not fetch current location.');
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleRegionChange = (newRegion) => {
    setRegion(newRegion);
  };

  const handleMapPress = (e) => {
    if (e.nativeEvent && e.nativeEvent.coordinate) {
      const newCoords = e.nativeEvent.coordinate;
      setMarker(newCoords);
      mapRef.current?.animateToRegion({
        ...newCoords,
        latitudeDelta: region.latitudeDelta || 0.005,
        longitudeDelta: region.longitudeDelta || 0.005,
      }, 500);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {canShowNativeMap ? (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={region}
            onRegionChangeComplete={handleRegionChange}
            onPress={handleMapPress}
          >
            <Marker 
              coordinate={marker} 
              draggable
              onDragEnd={(e) => {
                const newCoords = e.nativeEvent.coordinate;
                setMarker(newCoords);
                mapRef.current?.animateToRegion({
                  ...newCoords,
                  latitudeDelta: region.latitudeDelta || 0.005,
                  longitudeDelta: region.longitudeDelta || 0.005,
                }, 500);
              }}
            />
          </MapView>
        ) : (
          <WebView
            ref={webViewRef}
            style={styles.map}
            originWhitelist={['*']}
            source={webViewSource}
            onMessage={onWebMessage}
            scrollEnabled={false}
          />
        )}

        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for location..."
            value={searchQuery}
            onChangeText={handleSearch}
            placeholderTextColor="#999"
          />
          {isSearching && <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: 10 }} />}
        </View>

        {searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.place_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResultItem}
                  onPress={() => selectPlace(item.place_id)}
                >
                  <Ionicons name="location-outline" size={20} color="#666" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultMainText} numberOfLines={1}>{item.structured_formatting.main_text}</Text>
                    <Text style={styles.resultSubText} numberOfLines={1}>{item.structured_formatting.secondary_text}</Text>
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 250 }}
            />
          </View>
        )}

        <View style={styles.overlay}>
          <View style={styles.headerRow}>
            <Text style={styles.instruction}>Drag the pin to your exact location</Text>
            <TouchableOpacity 
              style={styles.currentLocBtn} 
              onPress={fetchCurrentLocation}
              disabled={loadingLocation}
            >
              {loadingLocation ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="locate" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmButton, loadingLocation && { opacity: 0.6 }]} 
              onPress={async () => {
                setLoadingLocation(true);
                try {
                  const address = await reverseGeocode(marker.latitude, marker.longitude);
                  onConfirm({ ...marker, address });
                } catch (err) {
                  onConfirm(marker);
                } finally {
                  setLoadingLocation(false);
                }
              }}
              disabled={loadingLocation}
            >
              {loadingLocation ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.confirmText}>Confirm Location</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  map: {
    flex: 1,
    width: width,
    height: height,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  fallbackContent: {
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 30,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  fallbackIcon: {
    fontSize: 50,
    marginBottom: 20,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.black,
    marginBottom: 12,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    fontSize: 14,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  coordBox: {
    backgroundColor: '#f1f3f5',
    padding: 16,
    borderRadius: 12,
    width: '100%',
  },
  coordLabel: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: Colors.primary,
    marginBottom: 4,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  instruction: {
    fontSize: 15,
    color: Colors.black,
    fontWeight: '600',
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  currentLocBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f3f5',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
  },
  cancelText: {
    color: Colors.subText,
    fontWeight: 'bold',
  },
  confirmButton: {
    flex: 2,
    height: 50,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  confirmText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    zIndex: 1000,
  },
  backBtn: {
    padding: 5,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: '#000',
    paddingVertical: 8,
  },
  searchResultsContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 115 : 95,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    overflow: 'hidden',
    zIndex: 1000,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultMainText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  resultSubText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
