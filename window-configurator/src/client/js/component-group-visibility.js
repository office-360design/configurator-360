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

export function isComponentProfileVisibleOnHost({
    sourceGroup,
    hostGroup,
    sourceGroupVisible = true,
    hostGroupVisible = true,
    profileChecked = true,
}) {
    if (!hostGroupVisible) return false;
    if (profileChecked) return true;

    // "Toggle all" hides the source group by unchecking its profile rows. A
    // reusable CAD profile can also have a separately-authored occurrence on a
    // different physical host (for example 224068/200988 sourced from the frame
    // assembly but mounted on a mullion). In that case the unchecked source row
    // must not hide the copy on another still-visible host.
    //
    // If the source group itself is still visible, an unchecked row is a manual
    // per-profile choice and remains global on purpose.
    return sourceGroup !== hostGroup && !sourceGroupVisible;
}
