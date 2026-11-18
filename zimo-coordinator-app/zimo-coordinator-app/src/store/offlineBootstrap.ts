import type { QueryClient } from '@tanstack/react-query';
import {
  categoriesApi,
  clustersApi,
  boundaryApi,
  farmsApi,
  harvestApi,
  mapApi,
  sitesApi,
  unitsApi,
  uploadsApi,
  verificationApi,
  visitsApi,
} from '@/services/api';

export async function cacheOfflineReferenceData(queryClient: QueryClient): Promise<boolean> {
  let complete = true;
  const farmRequest = queryClient.fetchQuery({
    queryKey: ['farms'],
    queryFn: () => farmsApi.allPages({ limit: 100 }),
  });
  const clusterRequest = queryClient.fetchQuery({
    queryKey: ['clusters'],
    queryFn: () => clustersApi.list(),
  });
  const referenceRequests = [
    queryClient.fetchQuery({
      queryKey: ['categories'],
      queryFn: () => categoriesApi.list(),
    }),
    queryClient.fetchQuery({
      queryKey: ['map-config'],
      queryFn: () => mapApi.config(),
    }),
    queryClient.fetchQuery({
      queryKey: ['harvest', 'drivers'],
      queryFn: () => harvestApi.drivers(),
    }),
    queryClient.fetchQuery({
      queryKey: ['harvest', 'collectable-farms'],
      queryFn: () => harvestApi.collectableFarms(),
    }),
    queryClient.fetchQuery({
      queryKey: ['harvest', 'thresholds'],
      queryFn: () => harvestApi.thresholds(),
    }),
  ];

  const [farmResult, clusterResult, ...referenceResults] = await Promise.allSettled([
    farmRequest,
    clusterRequest,
    ...referenceRequests,
  ]);
  for (const result of referenceResults) {
    if (result.status === 'rejected') {
      complete = false;
      console.warn('Some reference data could not be cached for offline use.', result.reason);
    }
  }

  if (farmResult.status === 'rejected') {
    complete = false;
    console.warn('Assigned farms could not be cached for offline use.', farmResult.reason);
  } else {
    const farms = farmResult.value.data.data.items;
    for (const farm of farms) {
      const profileRequests = await Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: ['farm-profile', farm.appId],
          queryFn: () => farmsApi.profile(farm.appId),
        }),
        queryClient.fetchQuery({
          queryKey: ['farm-profile', farm.appId, undefined],
          queryFn: () => farmsApi.profile(farm.appId),
        }),
        queryClient.fetchQuery({
          queryKey: ['sites', farm.appId],
          queryFn: () => sitesApi.list(farm.appId),
        }),
        queryClient.fetchQuery({
          queryKey: ['visits', farm.appId],
          queryFn: () => visitsApi.list(farm.appId),
        }),
      ]);

      for (const result of [profileRequests[0], profileRequests[1], profileRequests[3]]) {
        if (result.status === 'rejected') {
          complete = false;
          console.warn(`Some field data for farm ${farm.appId} could not be cached for offline use.`, result.reason);
        }
      }

      const sitesResult = profileRequests[2];
      if (sitesResult.status === 'rejected') {
        complete = false;
        console.warn(`Sites for farm ${farm.appId} could not be cached for offline use.`, sitesResult.reason);
        continue;
      }

      const sites = sitesResult.value.data.data.sites;
      for (const site of sites) {
        const siteDataResults = await Promise.allSettled([
          queryClient.fetchQuery({
            queryKey: ['units', farm.appId, site.siteId],
            queryFn: () => unitsApi.list(farm.appId, site.siteId),
          }),
          queryClient.fetchQuery({
            queryKey: ['verification-record', farm.appId, undefined, site.siteId],
            queryFn: () => verificationApi.get(farm.appId, undefined, site.siteId),
          }),
          queryClient.fetchQuery({
            queryKey: ['boundary', farm.appId, '', site.siteId],
            queryFn: () => boundaryApi.get(farm.appId, undefined, site.siteId),
          }),
          queryClient.fetchQuery({
            queryKey: ['evidence-photos', farm.appId, '', site.siteId],
            queryFn: () => uploadsApi.photos(farm.appId, 'evidence', undefined, site.siteId),
          }),
        ]);
        for (const result of siteDataResults) {
          if (result.status === 'rejected') {
            complete = false;
            console.warn(
              `Some verification data for site ${site.siteId} on farm ${farm.appId} could not be cached for offline use.`,
              result.reason
            );
          }
        }

        const unitsResult = siteDataResults[0];
        if (unitsResult.status === 'fulfilled') {
          for (const unit of unitsResult.value.data.data.units) {
            const unitDataResults = await Promise.allSettled([
              queryClient.fetchQuery({
                queryKey: ['verification-record', farm.appId, unit.unitId, undefined],
                queryFn: () => verificationApi.get(farm.appId, unit.unitId),
              }),
              queryClient.fetchQuery({
                queryKey: ['boundary', farm.appId, unit.unitId, ''],
                queryFn: () => boundaryApi.get(farm.appId, unit.unitId),
              }),
            ]);
            for (const result of unitDataResults) {
              if (result.status === 'rejected') {
                complete = false;
                console.warn(
                  `Some verification data for unit ${unit.unitId} on farm ${farm.appId} could not be cached for offline use.`,
                  result.reason
                );
              }
            }
          }
        }
      }
    }
  }

  if (clusterResult.status === 'rejected') {
    complete = false;
    console.warn('Assigned clusters could not be cached for offline use.', clusterResult.reason);
  } else {
    for (const cluster of clusterResult.value.data.data.clusters) {
      const clusterResults = await Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: ['cluster', cluster.clusterId],
          queryFn: () => clustersApi.get(cluster.clusterId),
        }),
        queryClient.fetchQuery({
          queryKey: ['verification-record', cluster.clusterId, undefined, undefined],
          queryFn: () => verificationApi.get(cluster.clusterId),
        }),
      ]);
      for (const result of clusterResults) {
        if (result.status === 'rejected') {
          complete = false;
          console.warn(`Cluster data for ${cluster.clusterId} could not be cached for offline use.`, result.reason);
        }
      }
    }
  }

  return complete;
}
