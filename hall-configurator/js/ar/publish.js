import { publishAR } from '../../../shared-ui/src/ar/publish.js?v=locales-6';
export const publishHallAR = (asset, options = {}) => publishAR(asset, { ...options, product: 'hall' });
