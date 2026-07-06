import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { farmsApi, verificationApi } from '@/services/api';
import { getErrorMessage } from '@/utils/errors';

export function useFarmProfile(appId: string) {
  return useQuery({
    queryKey: ['farm-profile', appId],
    queryFn: () => farmsApi.profile(appId),
    select: (res) => res.data.data,
    staleTime: 1000 * 30, // 30s — refresh relatively often during active verification
  });
}

export function useApproveVerification(appId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => verificationApi.approve(appId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['farm-profile', appId] });
      await qc.invalidateQueries({ queryKey: ['farms'] });
    },
    onError: (err) => {
      Alert.alert('Error', getErrorMessage(err));
    },
  });
}
