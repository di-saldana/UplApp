/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState, useEffect } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, useColorScheme, View, Button, Image, Linking } from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import { launchImageLibrary } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { SpotifyService } from './SpotifyService';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState<string>('');

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      console.log('Redirected back with URL:', url);
      // Extract access token or code and handle auth flow here
      SpotifyService.handleAuthRedirect(url); 
    };

    Linking.addEventListener('url', handleDeepLink);

    // Also handle case when app is opened via cold start with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => {
      Linking.removeAllListeners('url');
    };
  }, []);

  useEffect(() => {
    const handleSpotifyLogin = async () => {
      try {
        const authUrl = await SpotifyService.requestAuthorization();
        if (authUrl) {
          Linking.openURL(authUrl);
        }
      } catch (error) {
        console.error('Error requesting Spotify authorization:', error);
      }
    };

    handleSpotifyLogin();
  }, []);

  const handleGalleryOpen = async () => {
    const options = {
      mediaType: 'photo' as const,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      selectionLimit: 0, // Allow multiple selection
    };

    launchImageLibrary(options, async (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
        return;
      }

      if (response.errorCode) {
        console.error('Image picker error: ', response.errorCode);
        return;
      }

      const assets = response.assets;
      if (!assets || assets.length === 0) {
        console.warn('No images selected');
        return;
      }

      for (const asset of assets) {
        const imageUri = asset.uri;

        if (imageUri) {
          try {
            const resultText = await TextRecognition.recognize(imageUri);
            console.log('Recognized text:', resultText.text);

            const trackUri = await SpotifyService.searchTrack(resultText.text);

            if (trackUri) {
              await SpotifyService.addSongToUplPlaylist(trackUri);
              console.log('✅ Song added from:', resultText.text);
            } else {
              console.warn('❌ No matching track found for:', resultText.text);
            }
          } catch (error) {
            console.error('Error processing image:', imageUri, error);
          }
        }
      }
    });
  };

  /*
   * To keep the template simple and small we're adding padding to prevent view
   * from rendering under the System UI.
   * For bigger apps the recommendation is to use `react-native-safe-area-context`:
   * https://github.com/AppAndFlow/react-native-safe-area-context
   *
   * You can read more about it here:
   * https://github.com/react-native-community/discussions-and-proposals/discussions/827
   */
  const safePadding = '5%';

  return (
    <View style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}/>

      <ScrollView style={backgroundStyle}>

        <View
          style={{
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
            paddingHorizontal: safePadding,
            paddingBottom: safePadding,
            paddingRight: safePadding, //
          }}> 

          <View style={{ marginTop: 50, padding: 20 }}>
            <Button title="Upload Image" onPress={handleGalleryOpen}/>
            {imageUri && <Image source={{ uri: imageUri }} style={{ width: 300, height: 300 }}/>}
            {recognizedText ? <Text>{recognizedText}</Text> : null}
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({});

export default App;
