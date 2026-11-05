import ComponentTypes from '@theme-original/NavbarItem/ComponentTypes';
import GitHubStarNavbarItem from '@theme/GitHubStarNavbarItem';
import SdkSwitcherNavbarItem from '@theme/SdkSwitcherNavbarItem';

const customComponentTypes = {
  ...ComponentTypes,
  'custom-githubStar': GitHubStarNavbarItem,
  'custom-sdkSwitcher': SdkSwitcherNavbarItem,
};

export default customComponentTypes;
