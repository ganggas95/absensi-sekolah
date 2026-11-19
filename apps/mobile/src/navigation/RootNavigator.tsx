import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useServer } from "../context/ServerContext";
import { useAuth } from "../context/AuthContext";

import ServerSetupScreen from "../screens/ServerSetupScreen";
import LoginScreen from "../screens/LoginScreen";
import MainTabs from "./MainTabs";
import ScheduleListScreen from "../screens/ScheduleListScreen";
import AttendanceSessionScreen from "../screens/AttendanceSessionScreen";
import ChangePasswordScreen from "../screens/ChangePasswordScreen";
import EditProfileScreen from "../screens/EditProfileScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isConfigured, isLoading: serverLoading } = useServer();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  if (serverLoading || authLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#1e3a8a",
        }}
      >
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {!isConfigured ? (
          <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
        ) : !isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen
              name="AttendanceSession"
              component={AttendanceSessionScreen}
            />
            <Stack.Screen
              name="ChangePassword"
              component={ChangePasswordScreen}
            />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen
              name="ScheduleList"
              component={ScheduleListScreen}
            />
            <Stack.Screen name="ServerSetup" component={ServerSetupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
