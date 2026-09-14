import React, { useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text } from '@/components/ui/typography';
import { useRouter } from 'expo-router';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/utils/errors';

/**
 * Set a password: a coordinator's first one, or a forgotten one.
 *
 * Approving a coordinator's application creates their account with a
 * random password nobody knows. The coordinator sets their own here, with
 * a code sent to the email they applied with, which also proves the address
 * is theirs. Then they are signed straight in.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const sendCode = async () => {
    setProblem(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setProblem('Enter the email address you applied with.');
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setStage('code');
    } catch (err: unknown) {
      setProblem(getErrorMessage(err, 'Could not send a code. Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const setNewPassword = async () => {
    setProblem(null);
    if (code.trim() === '') {
      setProblem('Enter the code from the email.');
      return;
    }
    if (password.length < 8) {
      setProblem('Use at least 8 characters for the password.');
      return;
    }
    if (password !== confirm) {
      setProblem('The two passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword({ email: email.trim(), code: code.trim(), password });
    } catch (err: unknown) {
      setProblem(getErrorMessage(err, 'That code did not work. Check it, or ask for a new one.'));
      setLoading(false);
      return;
    }

    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err: unknown) {
      /*
        The password is changed either way. A refusal here usually means
        the account is not a coordinator yet: the application is still
        waiting for approval.
      */
      Alert.alert(
        'Password set',
        getErrorMessage(err, 'Your password is set, but signing in did not work. If your application is still being reviewed, try again once it is approved.')
      );
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-bg">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 justify-center px-6 py-12">
          <View className="mb-8">
            <Text className="text-2xl font-bold text-text">Set your password</Text>
            <Text className="text-text-3 mt-1">
              {stage === 'email'
                ? 'Use this the first time you sign in after your application is approved, or if you have forgotten your password.'
                : `We sent a code to ${email.trim()}. Enter it with your new password.`}
            </Text>
          </View>

          <View className="gap-4">
            {stage === 'email' ? (
              <>
                <Input
                  label="Email address you applied with"
                  placeholder="coordinator@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                />
                {problem ? <Text className="text-red-500 text-sm">{problem}</Text> : null}
                <Button label="Send Code" onPress={sendCode} loading={loading} fullWidth size="lg" />
              </>
            ) : (
              <>
                <Input label="Code from the email" keyboardType="number-pad" autoCapitalize="none" value={code} onChangeText={setCode} />
                <Input label="New password" placeholder="At least 8 characters" secureTextEntry value={password} onChangeText={setPassword} />
                <Input label="New password again" secureTextEntry value={confirm} onChangeText={setConfirm} />
                {problem ? <Text className="text-red-500 text-sm">{problem}</Text> : null}
                <Button label="Set Password and Sign In" onPress={setNewPassword} loading={loading} fullWidth size="lg" />
                <Button label="Send a new code" onPress={sendCode} variant="ghost" fullWidth disabled={loading} />
              </>
            )}

            <Button label="Back to Sign In" onPress={() => router.replace('/(auth)/login')} variant="secondary" fullWidth />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
