import {
    areSelectedComponentProfilesVisible,
    isSelectedComponentProfile,
    shouldCheckComponentProfile,
} from '../../src/client/js/component-group-visibility.js';

const errors = [];
const assert = (condition, message) => {
    if (!condition) errors.push(message);
};

const frame = { id: 'frame', accessory: false };
const selectedAccessory = { id: 'selected-accessory', accessory: true, enabled: true };
const unselectedAccessory = { id: 'unselected-accessory', accessory: true, enabled: false };
const profiles = [frame, selectedAccessory, unselectedAccessory];
const isManagedAccessoryProfile = profile => profile.accessory;
const isAccessoryProfileEnabled = profile => profile.enabled;

assert(
    isSelectedComponentProfile(frame, isManagedAccessoryProfile, isAccessoryProfileEnabled),
    'The structural profile must always belong to its piece visibility group.'
);
assert(
    isSelectedComponentProfile(selectedAccessory, isManagedAccessoryProfile, isAccessoryProfileEnabled),
    'An enabled accessory must follow its bound piece visibility.'
);
assert(
    !isSelectedComponentProfile(unselectedAccessory, isManagedAccessoryProfile, isAccessoryProfileEnabled),
    'A disabled accessory must not be selected by Toggle All.'
);

const checked = new Map([
    ['frame', true],
    ['selected-accessory', true],
    ['unselected-accessory', false],
]);
assert(
    areSelectedComponentProfilesVisible({
        profiles,
        getCheckboxChecked: profile => checked.get(profile.id),
        isManagedAccessoryProfile,
        isAccessoryProfileEnabled,
    }),
    'A disabled accessory must not prevent Toggle All from recognizing the piece as visible.'
);

assert(
    !shouldCheckComponentProfile({
        profile: unselectedAccessory,
        groupVisible: true,
        isManagedAccessoryProfile,
        isAccessoryProfileEnabled,
    }),
    'Turning a piece on must not enable an accessory that is not selected.'
);
assert(
    shouldCheckComponentProfile({
        profile: selectedAccessory,
        groupVisible: true,
        isManagedAccessoryProfile,
        isAccessoryProfileEnabled,
    }),
    'Turning a piece on must show its selected accessory.'
);
assert(
    !shouldCheckComponentProfile({
        profile: selectedAccessory,
        groupVisible: false,
        isManagedAccessoryProfile,
        isAccessoryProfileEnabled,
    }),
    'Turning a piece off must hide its selected accessory without changing selection state.'
);

if (errors.length) {
    console.error('Component group visibility validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Component group visibility valid: Toggle All preserves accessory selection.');
}
