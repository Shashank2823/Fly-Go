import { useQuery } from '@tanstack/react-query';
import { apiRequest } from './client';

export interface Country {
  code: string;
  name: string;
}

export function useCountries() {
  return useQuery({
    queryKey: ['reference', 'countries'],
    queryFn: () => apiRequest<Country[]>('/reference/countries'),
    staleTime: Infinity,
  });
}
