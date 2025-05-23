/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, useColorScheme, View, Button, Image } from 'react-native';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import { launchImageLibrary } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [recognizedText, setRecognizedText] = useState<string>('');

  const handleGalleryOpen = () =>  {
    const options = {
      mediaType: 'photo' as const,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
    };

    launchImageLibrary(options, async (response) => {
      if (response.didCancel) {
        console.log('User cancelled image picker');
      } else if (response.errorCode) {
        console.log('Image picker error: ', response.errorCode);
      } else {
        let imageUri = response.assets?.[0]?.uri;

        if (imageUri) {
          setImageUri(imageUri);
          
          const resultText = await TextRecognition.recognize(imageUri);
          setRecognizedText(resultText.text);
          console.log(resultText.text);
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
