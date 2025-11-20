import { Dimensions } from 'react-native';

// Guideline sizes are based on standard ~5" screen mobile device
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Scale a size based on the screen width.
 * Use this for horizontal dimensions (width, marginHorizontal, paddingHorizontal).
 */
const scale = (size: number) => (SCREEN_WIDTH / guidelineBaseWidth) * size;

/**
 * Scale a size based on the screen height.
 * Use this for vertical dimensions (height, marginVertical, paddingVertical).
 */
const verticalScale = (size: number) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;

/**
 * Scale a size with a factor to control the resizing.
 * factor = 0.5 means the result will be the average of the original size and the scaled size.
 * Use this for font sizes or dimensions that shouldn't scale linearly (like icons).
 */
const moderateScale = (size: number, factor = 0.5) => size + (scale(size) - size) * factor;

export { scale, verticalScale, moderateScale, SCREEN_WIDTH, SCREEN_HEIGHT };
