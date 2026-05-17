import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Platform } from 'react-native';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 20 }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 10 }}>Oops! Something went wrong.</Text>
            <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 15 }}>
              We're sorry, but the application encountered an unexpected error.
            </Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
              onPress={this.handleReset}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Try Again</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ flex: 1, borderTopWidth: 1, borderColor: '#eee', paddingTop: 15 }}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#FF231F', marginBottom: 5 }}>NATIVE DIAGNOSTIC CONSOLE:</Text>
            <View style={{ flex: 1, backgroundColor: '#F8F9FA', borderRadius: 8, padding: 10 }}>
              <View style={{ height: '100%' }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 5 }}>
                  Error: {this.state.error?.toString() || 'Unknown Runtime Exception'}
                </Text>
                <Text style={{ fontSize: 10, color: '#666', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                  {this.state.error?.stack || 'No Stack Trace Available'}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children; 
  }
}
