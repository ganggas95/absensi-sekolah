import React from "react";
import { Platform } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarClock, Home, UserCheck, UserRound } from "lucide-react-native";
import HomeScreen from "../screens/HomeScreen";
import KbmScreen from "../screens/KbmScreen";
import AttendanceTabScreen from "../screens/AttendanceTabScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

const ACTIVE = "#1e3a8a";
const INACTIVE = "#94a3b8";

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === "ios" ? 8 : 6);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          height: 56 + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
          borderTopColor: "#e2e8f0",
          backgroundColor: "#ffffff",
        },
        tabBarItemStyle: { minHeight: 44 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarAccessibilityLabel: "Tab Home",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="KBM"
        component={KbmScreen}
        options={{
          tabBarLabel: "KBM",
          tabBarAccessibilityLabel: "Tab KBM",
          tabBarIcon: ({ color, size }) => <CalendarClock size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Absensi"
        component={AttendanceTabScreen}
        options={{
          tabBarLabel: "Absensi",
          tabBarAccessibilityLabel: "Tab Absensi",
          tabBarIcon: ({ color, size }) => <UserCheck size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="User"
        component={ProfileScreen}
        options={{
          tabBarLabel: "User",
          tabBarAccessibilityLabel: "Tab User",
          tabBarIcon: ({ color, size }) => <UserRound size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
