import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  type TextInputProps,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const base = 'flex-row items-center justify-center rounded-xl';
  const variants = {
    primary: 'bg-green-500',
    secondary: 'bg-white border border-green-500',
    danger: 'bg-red-500',
    ghost: 'bg-transparent',
  };
  const sizes = { sm: 'px-3 py-2', md: 'px-5 py-3.5', lg: 'px-6 py-4' };
  const textVariants = {
    primary: 'text-white font-semibold',
    secondary: 'text-green-500 font-semibold',
    danger: 'text-white font-semibold',
    ghost: 'text-green-500 font-semibold',
  };
  const textSizes = { sm: 'text-sm', md: 'text-base', lg: 'text-base' };
  const opacity = disabled || loading ? 0.5 : 1;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[{ opacity, width: fullWidth ? '100%' : undefined }, style]}
      className={`${base} ${variants[variant]} ${sizes[size]}`}
      activeOpacity={0.8}
    >
      {loading && <ActivityIndicator color={variant === 'secondary' ? '#0D7A3D' : '#fff'} className="mr-2" />}
      <Text className={`${textVariants[variant]} ${textSizes[size]}`}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function Input({ label, error, containerStyle, ...props }: InputProps) {
  return (
    <View style={containerStyle}>
      {label && <Text className="text-sm font-medium text-text-2 mb-1.5">{label}</Text>}
      <TextInput
        className={`bg-white border rounded-xl px-4 py-3.5 text-text text-base ${
          error ? 'border-red-500' : 'border-border'
        }`}
        placeholderTextColor="#8896A7"
        {...props}
      />
      {error && <Text className="text-red-500 text-xs mt-1">{error}</Text>}
    </View>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}
export function Card({ children, className = '', style }: CardProps) {
  return (
    <View
      className={`bg-card rounded-2xl p-4 shadow-sm ${className}`}
      style={[{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }, style]}
    >
      {children}
    </View>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue';

const badgeStyles: Record<BadgeVariant, { container: string; text: string }> = {
  green: { container: 'bg-green-50 border border-green-100', text: 'text-green-500' },
  yellow: { container: 'bg-yellow-50 border border-yellow-100', text: 'text-yellow-500' },
  red: { container: 'bg-red-50 border border-red-100', text: 'text-red-500' },
  gray: { container: 'bg-gray-100 border border-gray-200', text: 'text-gray-500' },
  blue: { container: 'bg-blue-50 border border-blue-100', text: 'text-blue-500' },
};

export function Badge({ label, variant = 'gray' }: { label: string; variant?: BadgeVariant }) {
  const s = badgeStyles[variant];
  return (
    <View className={`rounded-full px-2.5 py-0.5 self-start ${s.container}`}>
      <Text className={`text-xs font-semibold ${s.text}`}>{label}</Text>
    </View>
  );
}

// ─── StatusBadge (maps backend status to visual variant) ─────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    verified: { label: 'Verified', variant: 'green' },
    approved: { label: 'Approved', variant: 'green' },
    reviewing: { label: 'In Review', variant: 'yellow' },
    in_progress: { label: 'In Progress', variant: 'yellow' },
    submitted: { label: 'Submitted', variant: 'blue' },
    identity_mismatch: { label: 'ID Mismatch', variant: 'red' },
    flagged: { label: 'Flagged', variant: 'red' },
    rejected: { label: 'Rejected', variant: 'red' },
    unvisited: { label: 'Unvisited', variant: 'gray' },
    paid: { label: 'Paid', variant: 'green' },
    pending: { label: 'Pending', variant: 'yellow' },
  };
  const { label, variant } = map[status] ?? { label: status, variant: 'gray' };
  return <Badge label={label} variant={variant} />;
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ className = '' }: { className?: string }) {
  return <View className={`h-px bg-border ${className}`} />;
}

// ─── LoadingSpinner ───────────────────────────────────────────────────────────
export function LoadingSpinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size={size} color="#0D7A3D" />
    </View>
  );
}

// ─── ErrorMessage ─────────────────────────────────────────────────────────────
export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-text-3 text-center mb-4">{message}</Text>
      {onRetry && (
        <Button label="Retry" onPress={onRetry} variant="secondary" size="sm" />
      )}
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction }: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-base font-bold text-text">{title}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction}>
          <Text className="text-sm text-green-500 font-medium">{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────
export function InfoRow({ label, value, style }: { label: string; value: string; style?: TextStyle }) {
  return (
    <View className="flex-row justify-between items-center py-2.5 border-b border-border">
      <Text className="text-sm text-text-3">{label}</Text>
      <Text className="text-sm font-medium text-text flex-1 text-right ml-4" style={style}>{value || '—'}</Text>
    </View>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = '#0D7A3D' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <View style={{ width: `${pct}%`, backgroundColor: color, height: '100%', borderRadius: 99 }} />
    </View>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
export function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      className={`w-12 h-6 rounded-full ${value ? 'bg-green-500' : 'bg-gray-300'} justify-center`}
      activeOpacity={0.8}
    >
      <View
        className="w-5 h-5 bg-white rounded-full shadow-sm"
        style={{ transform: [{ translateX: value ? 24 : 2 }] }}
      />
    </TouchableOpacity>
  );
}
