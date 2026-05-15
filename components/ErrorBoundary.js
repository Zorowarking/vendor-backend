import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';

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
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 10 }}>Oops! Something went wrong.</Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 30 }}>
            We're sorry, but the application encountered an unexpected error.
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#4CAF50', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
            onPress={this.handleReset}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Try Again</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    return this.props.children; 
  }
}
