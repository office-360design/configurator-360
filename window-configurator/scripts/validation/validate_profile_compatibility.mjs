import {
    resolveAccessoryPlacement,
    resolveGlazingComponents,
    resolveGlazingBeadProfileId,
    resolveMovableGasketProfileId,
} from '../../src/client/js/profile-compatibility.js';

const errors = [];

function assert(condition, message) {
    if (!condition) errors.push(message);
}

const expectedBeads = new Map([
    [16, '573940'],
    [19, '573940'],
    [20, '573930'],
    [24, '573930'],
    [25, '573920'],
    [29, '573920'],
]);

for (const [thickness, expectedProfileId] of expectedBeads) {
    assert(
        resolveGlazingBeadProfileId(thickness) === expectedProfileId,
        `${thickness} mm glass resolved to the wrong glazing bead.`
    );
}

for (let thickness = 16; thickness <= 29; thickness += 1) {
    const remainder = thickness % 5;
    const expectedProfileId = remainder === 0
        ? '224379'
        : (remainder === 1 || remainder === 2 ? '224378' : '224350');

    assert(
        resolveMovableGasketProfileId(thickness) === expectedProfileId,
        `${thickness} mm glass resolved to the wrong movable gasket.`
    );
}

const glazing = resolveGlazingComponents(24);
assert(glazing.fixedGasketProfileId === '224063', 'The fixed glass gasket must remain 224063.');
assert(glazing.glazingBeadProfileId === '573930', '24 mm glass must use bead 573930.');
assert(glazing.movableGasketProfileId === '224350', '24 mm glass must use gasket 224350.');

for (const profileSetId of [
    '2_4_Oeffnungselemnt_Vertikal',
    '2_5_Oeffnungselemnt_Vertikal',
    '2_6_Oeffnungselemnt_Vertikal',
]) {
    assert(
        resolveAccessoryPlacement({
            accessoryProfileId: '208694',
            profileSetId,
            side: 'bottom',
            location: 'exterior',
        }).compatible,
        `Drainage cap 208694 should be compatible with the bottom of ${profileSetId}.`
    );

    for (const side of ['top', 'left', 'right']) {
        assert(
            !resolveAccessoryPlacement({
                accessoryProfileId: '208694',
                profileSetId,
                side,
                location: 'exterior',
            }).compatible,
            `Drainage cap 208694 must not be permitted on the ${side} of ${profileSetId}.`
        );
    }
}


for (const side of ['top', 'bottom', 'left', 'right']) {
    assert(
        resolveAccessoryPlacement({
            accessoryProfileId: '275701',
            hostProfileId: '575780',
            side,
        }).compatible,
        `Locking bar 275701 should be placeable on the sash ${side}.`
    );
}
assert(
    !resolveAccessoryPlacement({
        accessoryProfileId: '275701',
        hostProfileId: '575760',
        side: 'top',
    }).compatible,
    'Locking bar 275701 must not attach to an outer-frame profile.'
);
assert(
    resolveAccessoryPlacement({
        accessoryProfileId: '288319',
        hostProfileId: '575780',
        side: 'bottom',
    }).compatible,
    'Glazing bridge 288319 should be permitted on the sash bottom.'
);
assert(
    !resolveAccessoryPlacement({
        accessoryProfileId: '288319',
        hostProfileId: '575780',
        side: 'top',
    }).compatible,
    'Glazing bridge 288319 must remain bottom-only.'
);
assert(
    resolveAccessoryPlacement({
        accessoryProfileId: '200988',
        hostProfileId: '575770',
        side: 'left',
    }).compatible,
    'Insulation profile 200988 should be placeable around the frame perimeter.'
);

assert(
    !resolveAccessoryPlacement({
        accessoryProfileId: '208694',
        hostProfileId: '575780',
        side: 'bottom',
        location: 'exterior',
    }).compatible,
    'Drainage cap 208694 must not attach to the sash profile 575780.'
);

if (errors.length) {
    console.error('Profile compatibility validation failed:');
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('Profile compatibility valid: glazing and accessory placement rules passed.');
}
