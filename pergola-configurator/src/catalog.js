export const STEPS = [
  { id: 'structure', label: 'Structure' },
  { id: 'finish', label: 'Finish & roof' },
  { id: 'automation', label: 'Automation' },
  { id: 'sides', label: 'Side closings' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'summary', label: 'Summary' },
];

export const MODEL_OPTIONS = [
  {
    value: 'lite',
    label: 'Lite',
    description: 'Clean entry-level frame for compact terraces.',
    badge: 'Compact',
  },
  {
    value: 'comfort',
    label: 'Comfort',
    description: 'Stronger beams with integrated drainage.',
    badge: 'Popular',
  },
  {
    value: 'premium',
    label: 'Premium',
    description: 'Heavy-duty frame, concealed drainage and trim details.',
    badge: 'Featured',
  },
];

export const DIMENSION_PRESETS = [
  [3000, 3000],
  [4000, 3000],
  [4000, 4000],
  [5000, 3500],
  [6000, 4000],
  [7000, 4000],
];

export const FRAME_COLORS = [
  { value: '#111619', label: 'Jet black' },
  { value: '#26343c', label: 'Anthracite' },
  { value: '#7f8588', label: 'Stone grey' },
  { value: '#e7e8e5', label: 'Architectural white' },
  { value: '#7b5a3d', label: 'Bronze' },
  { value: '#566247', label: 'Olive' },
];

export const LOUVER_COLORS = [
  { value: '#323b40', label: 'Graphite' },
  { value: '#64727b', label: 'Cool grey' },
  { value: '#d7d8d5', label: 'Soft white' },
  { value: '#8a7564', label: 'Warm bronze' },
];

export const SCREEN_COLORS = [
  { value: '#253139', label: 'Graphite mesh' },
  { value: '#34444c', label: 'Anthracite mesh' },
  { value: '#67757d', label: 'Stone grey mesh' },
  { value: '#9b9184', label: 'Sand mesh' },
  { value: '#d2d0c9', label: 'Pearl mesh' },
  { value: '#5c4c40', label: 'Bronze mesh' },
];

export const LED_COLORS = [
  { value: '#ffd27d', label: 'Warm 2700 K' },
  { value: '#fff1b4', label: 'Warm 3000 K' },
  { value: '#fff7dc', label: 'Neutral 4000 K' },
  { value: '#dfeeff', label: 'Cool white' },
  { value: '#9fc7ff', label: 'Ice blue' },
  { value: '#ff9c82', label: 'Sunset' },
];

export const AUTOMATION_OPTIONS = [
  {
    value: 'manual',
    label: 'Manual control with hand crank',
    icon: './assets/icons/automation-manual.svg',
  },
  {
    value: 'remote',
    label: 'Motorized with remote control',
    icon: './assets/icons/automation-remote.svg',
  },
  {
    value: 'wall-switch',
    label: 'Motorized with switches on the pergola',
    icon: './assets/icons/automation-switch.svg',
  },
];

export const SERVICE_OPTIONS = [
  {
    value: 'transportation',
    label: 'Transportation',
    icon: './assets/icons/service-transport.svg',
  },
  {
    value: 'assembly',
    label: 'Assembly',
    icon: './assets/icons/service-assembly.svg',
  },
  {
    value: 'warranty',
    label: '5 Year Warranty',
    icon: './assets/icons/service-warranty.svg',
  },
];

export const SIDE_OPTIONS = [
  {
    value: 'none',
    label: 'Open side',
    description: 'No side closing.',
    icon: './assets/icons/side-open.svg',
  },
  {
    value: 'screen',
    label: 'Pull-down screen',
    description: 'Semi-transparent weather screen.',
    icon: './assets/icons/side-screen.svg',
  },
  {
    value: 'motorized-screen',
    label: 'Motorized screen',
    description: 'Remote-operated zip screen.',
    icon: './assets/icons/side-motorized.svg',
  },
  {
    value: 'privacy-wall',
    label: 'Privacy wall',
    description: 'Aluminium horizontal louver wall.',
    icon: './assets/icons/side-privacy.svg',
  },
  {
    value: 'glass',
    label: 'Glass sliding doors',
    description: 'Frameless sliding glass panels.',
    icon: './assets/icons/side-glass.svg',
  },
];

export const ACCESSORY_OPTIONS = [
  {
    key: 'perimeterLed',
    label: 'Perimeter LED strip',
    description: 'Color-selectable integrated light under the frame.',
    model: './assets/models/accessories/led-strip.glb',
  },
  {
    key: 'spotlights',
    label: 'Integrated spotlights',
    description: 'Dimmable roof spotlights.',
    model: './assets/models/accessories/spotlight.glb',
  },
  {
    key: 'heaters',
    label: 'Infrared heaters',
    description: 'Suspended frame-mounted radiant heating.',
    model: './assets/models/accessories/heater.glb',
  },
  {
    key: 'sensors',
    label: 'Weather sensors',
    description: 'Selectable rain and wind sensor positions.',
    model: './assets/models/accessories/rain-sensor.glb',
  },
  {
    key: 'speakers',
    label: 'Outdoor speakers',
    description: 'One speaker can be mounted to each support pole.',
    model: './assets/models/accessories/speaker.glb',
  },
  {
    key: 'outlets',
    label: 'Electrical outlets',
    description: 'Up to four outlets per post at three heights.',
    model: './assets/models/accessories/outlet.glb',
  },
];

export const SENSOR_POSITIONS = [
  { value: 'front-left', label: 'Front left' },
  { value: 'front-center', label: 'Front center' },
  { value: 'front-right', label: 'Front right' },
  { value: 'left-center', label: 'Left center' },
  { value: 'right-center', label: 'Right center' },
  { value: 'back-left', label: 'Back left' },
  { value: 'back-center', label: 'Back center' },
  { value: 'back-right', label: 'Back right' },
];

export const HEATER_SIDES = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

export const SUPPORT_POLES = [
  { value: 'frontLeft', label: 'Front left' },
  { value: 'frontRight', label: 'Front right' },
  { value: 'backLeft', label: 'Back left' },
  { value: 'backRight', label: 'Back right' },
];

export const POLE_FACES = [
  { value: 'front', label: 'Front face' },
  { value: 'right', label: 'Right face' },
  { value: 'back', label: 'Back face' },
  { value: 'left', label: 'Left face' },
];

export const OUTLET_HEIGHTS = [
  { value: null, label: 'Off' },
  { value: '10', label: '10%' },
  { value: '50', label: '50%' },
  { value: '80', label: '80%' },
];

export const SIDE_NAMES = ['front', 'back', 'left', 'right'];
