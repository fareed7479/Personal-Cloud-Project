import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export type StatusType = 'healthy' | 'degraded' | 'unhealthy' | 'connecting' | 'offline';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'healthy':
        return {
          bg: colors.successLight,
          dot: colors.success,
          text: colors.success,
          defaultLabel: 'Online & Ready',
        };
      case 'degraded':
        return {
          bg: colors.warningLight,
          dot: colors.warning,
          text: colors.warning,
          defaultLabel: 'Degraded',
        };
      case 'connecting':
        return {
          bg: 'rgba(56, 189, 248, 0.15)',
          dot: colors.primary,
          text: colors.primary,
          defaultLabel: 'Checking...',
        };
      case 'unhealthy':
      case 'offline':
      default:
        return {
          bg: colors.errorLight,
          dot: colors.error,
          text: colors.error,
          defaultLabel: 'Disconnected',
        };
    }
  };

  const styleInfo = getBadgeStyle();

  return (
    <View style={[styles.container, { backgroundColor: styleInfo.bg }]}>
      <View style={[styles.dot, { backgroundColor: styleInfo.dot }]} />
      <Text style={[styles.text, { color: styleInfo.text }]}>
        {label || styleInfo.defaultLabel}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
