import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, SafeAreaView, ActivityIndicator } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/Colors';

const BANNER_HEIGHT = 50;

export default function NetworkBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const [slideAnim] = useState(new Animated.Value(-BANNER_HEIGHT));

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      
      Animated.timing(slideAnim, {
        toValue: state.isConnected ? -BANNER_HEIGHT : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    return () => unsubscribe();
  }, []);

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.leftRow}>
            <Ionicons name="cloud-offline" size={20} color={Colors.white} />
            <Text style={styles.text}>No internet connection</Text>
          </View>
          <View style={styles.rightRow}>
            <Text style={styles.retryText}>Waiting to reconnect...</Text>
            <ActivityIndicator size="small" color={Colors.white} style={styles.spinner} />
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: Colors.error,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  safeArea: {
    backgroundColor: Colors.error,
  },
  content: {
    height: BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  retryText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginRight: 10,
  },
  spinner: {
    transform: [{ scale: 0.8 }],
  }
});
