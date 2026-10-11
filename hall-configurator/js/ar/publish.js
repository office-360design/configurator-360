import { publishAR } from '../../../shared-ui/src/ar/publish.js?v=firebase-ar-5';
export const publishHallAR = (asset, options = {}) => publishAR(asset, { ...options, product: 'hall' });
