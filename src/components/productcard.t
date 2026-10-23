import { StyleSheet, Text, TextInput, View } from 'react-native';

export function LoginCard(){
    return (
        <View style={CardStyles.card}>
            <Text style={CardStyles.logincardText}>Login Card</Text>
            <TextInput placeholder="Username" />
            <TextInput placeholder="Password" secureTextEntry />
        </View>
    );
}

const CardStyles = StyleSheet.create({
    card:{
        backgroundColor: 'white',
        height: '60%',
        marginTop: '20%',
    },

    logincardText:{
        color: 'black',
        fontSize: 20,
        fontWeight: 'bold',

    }
    
})