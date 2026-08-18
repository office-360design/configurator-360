export function isSelectedComponentProfile(
    profile,
    isManagedAccessoryProfile = () => false,
    isAccessoryProfileEnabled = () => true
) {
    return !isManagedAccessoryProfile(profile)
        || isAccessoryProfileEnabled(profile);
}

export function areSelectedComponentProfilesVisible({
    profiles,
    getCheckboxChecked,
    isManagedAccessoryProfile = () => false,
    isAccessoryProfileEnabled = () => true,
}) {
    const selectedProfiles = profiles.filter(profile =>
        isSelectedComponentProfile(
            profile,
            isManagedAccessoryProfile,
            isAccessoryProfileEnabled
        )
    );

    return selectedProfiles.length > 0
        && selectedProfiles.every(profile => getCheckboxChecked(profile));
}

export function shouldCheckComponentProfile({
    profile,
    groupVisible,
    isManagedAccessoryProfile = () => false,
    isAccessoryProfileEnabled = () => true,
}) {
    return Boolean(groupVisible) && isSelectedComponentProfile(
        profile,
        isManagedAccessoryProfile,
        isAccessoryProfileEnabled
    );
}
