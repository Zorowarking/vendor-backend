import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '../constants/Colors';

export default function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={80} color={Colors.error} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.description}>{message || "We couldn't load the data. Please check your connection and try again."}</Text>
      
      {onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Retry Now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.black,
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: Colors.subText,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 30,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
