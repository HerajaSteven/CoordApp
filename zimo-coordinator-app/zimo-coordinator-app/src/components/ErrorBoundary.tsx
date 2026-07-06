import React, { Component, ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Sentry } from '@/config/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Without this, an uncaught render error anywhere in the tree crashes the
 * entire app to a blank white screen with no way to recover except a full
 * restart — genuinely bad for a coordinator mid-verification in the field.
 * This catches it, reports it to Sentry, and offers a "Try Again" button
 * that resets just the crashed subtree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View className="flex-1 bg-bg items-center justify-center px-6">
          <Text className="text-5xl mb-4">⚠️</Text>
          <Text className="text-lg font-bold text-text mb-2 text-center">
            Something went wrong
          </Text>
          <Text className="text-text-3 text-sm text-center mb-6">
            The app hit an unexpected error. Your data has been saved offline where possible.
            Try again, or restart the app if the problem continues.
          </Text>
          <TouchableOpacity
            onPress={this.handleReset}
            className="bg-green-500 rounded-xl px-6 py-3.5"
            activeOpacity={0.85}
          >
            <Text className="text-white font-bold">Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
