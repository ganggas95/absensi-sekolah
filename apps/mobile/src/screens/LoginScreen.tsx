import React, {useRef, useState} from "react";
import {Image} from "expo-image";
import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {Eye, EyeOff, GraduationCap, Lock, LogIn, Settings, User as UserIcon} from "lucide-react-native";
import {useAuth} from "../context/AuthContext";
import {iconColors, MIN_TOUCH} from "../theme/colors";
import {useServer} from "../context/ServerContext";
import {LinearGradient} from "expo-linear-gradient";

/* ───────────────────────────────────────────────
   Decorative floating dot
   ─────────────────────────────────────────────── */
function FloatingDot({
    size,
    color,
    top,
    left,
    right,
    delay = 0,
}: {
    size: number;
    color: string;
    top?: number;
    left?: number;
    right?: number;
    delay?: number;
}) {
    const anim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, {toValue: 1, duration: 1800, delay, useNativeDriver: true}),
                Animated.timing(anim, {toValue: 0, duration: 1800, useNativeDriver: true}),
            ]),
        );
        loop.start();
        return () => loop.stop();
    }, [anim, delay]);

    const translateY = anim.interpolate({inputRange: [0, 1], outputRange: [0, -8]});

    return (
        <Animated.View
            style={[
                {
                    position: "absolute",
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                    transform: [{translateY}],
                    top,
                    left,
                    right,
                },
            ]}
        />
    );
}

/* ───────────────────────────────────────────────
   Login Screen
   ─────────────────────────────────────────────── */
export default function LoginScreen({navigation}: any) {
    const {login} = useAuth();
    const {serverUrl} = useServer();

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Entrance animation
    const cardSlide = useRef(new Animated.Value(30)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(heroOpacity, {toValue: 1, duration: 500, useNativeDriver: true}),
            Animated.sequence([
                Animated.delay(150),
                Animated.parallel([
                    Animated.timing(cardSlide, {toValue: 0, duration: 500, useNativeDriver: true}),
                    Animated.timing(cardOpacity, {toValue: 1, duration: 500, useNativeDriver: true}),
                ]),
            ]),
        ]).start();
    }, [cardSlide, cardOpacity, heroOpacity]);

    const passwordRef = useRef<TextInput>(null);

    const handleLogin = async () => {
        if (!username.trim() || !password) {
            setErrorMessage("Silakan isi nama pengguna dan kata sandi.");
            return;
        }

        setErrorMessage(null);
        setLoading(true);

        try {
            await login(username.trim(), password);
        } catch (err: any) {
            const detail =
                err?.response?.data?.detail ||
                err?.message ||
                "Gagal masuk. Periksa kembali nama pengguna dan kata sandi Anda.";
            setErrorMessage(detail);
        } finally {
            setLoading(false);
        }
    };
    return (
        <KeyboardAvoidingView
            style={s.container}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView
                contentContainerStyle={s.scroll}
                keyboardShouldPersistTaps="handled"
                bounces={false}
            >
                {/* ═══════ Hero Section ═══════ */}
                <Animated.View style={{opacity: heroOpacity}}>
                    <LinearGradient
                        colors={["#0d1526", "#16213b", "#1c3058", "#263f75"]}
                        start={{x: 0, y: 0}}
                        end={{x: 1, y: 1}}
                        style={s.hero}
                    >
                        {/* Dot-grid pattern — decorative circles */}
                        <View style={s.gridOverlay}>
                            {Array.from({length: 35}).map((_, i) => (
                                <View key={i} style={s.gridDot} />
                            ))}
                        </View>

                        {/* Illustration icon */}
                        <View style={s.illustrationWrap}>
                            <View style={s.illustration}>
                                <View style={s.illustrationInner}>
                                    <GraduationCap size={34} strokeWidth={1.4} color="#a3bfff" />
                                </View>
                                <FloatingDot size={8} color="#70d6a4" top={8} right={10} delay={400} />
                                <FloatingDot size={6} color="#8c7cf6" top={40} left={6} delay={150} />
                                <FloatingDot size={5} color="#f0b957" right={5} top={48} delay={900} />
                            </View>
                        </View>

                        {/* Branding */}
                        <View style={s.heroBrand}>
                            <View style={s.logoFrame}>
                                <Image
                                    source={{uri: `${serverUrl}/logo.png`}}
                                    style={s.logo}
                                    contentFit="cover"
                                    accessibilityLabel="Logo SMPI Bina Cendekia Aqwam"
                                />
                            </View>
                            <View>
                                <Text style={s.brandName}>SMPI</Text>
                                <Text style={s.brandSub}>Bina Cendekia Aqwam</Text>
                            </View>
                        </View>

                        {/* Tagline */}
                        <Text style={s.heroEyebrow}>PORTAL GURU</Text>
                        <Text style={s.heroTitle}>Kelola presensi{"\n"}dengan lebih mudah.</Text>

                        {/* Wave bottom */}
                        <View style={s.wave} />
                    </LinearGradient>
                </Animated.View>

                {/* ═══════ Form Card (overlaps hero) ═══════ */}
                <Animated.View
                    style={[
                        s.cardOuter,
                        {opacity: cardOpacity, transform: [{translateY: cardSlide}]},
                    ]}
                >
                    <View style={s.card}>
                        {/* Heading */}
                        <View style={s.cardHeading}>
                            <View style={s.badge}>
                                <Text style={s.badgeText}>SELAMAT DATANG</Text>
                            </View>
                            <Text style={s.cardTitle}>Masuk ke akun Anda</Text>
                            <Text style={s.cardSubtitle}>
                                Gunakan akun guru untuk melanjutkan.
                            </Text>
                        </View>

                        {/* Error */}
                        {errorMessage ? (
                            <View style={s.errorBox} accessibilityRole="alert">
                                <Text style={s.errorBoxText}>{errorMessage}</Text>
                            </View>
                        ) : null}

                        {/* Username */}
                        <Text style={s.label}>Nama pengguna</Text>
                        <View style={s.inputRow}>
                            <UserIcon size={18} color="#94a3b8" />
                            <TextInput
                                testID="input-username"
                                style={s.input}
                                value={username}
                                onChangeText={setUsername}
                                placeholder="Masukkan username guru"
                                placeholderTextColor="#a0aec0"
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="username"
                                returnKeyType="next"
                                onSubmitEditing={() => passwordRef.current?.focus()}
                                editable={!loading}
                                accessibilityLabel="Nama pengguna"
                            />
                        </View>

                        {/* Password */}
                        <Text style={s.label}>Kata sandi</Text>
                        <View style={s.inputRow}>
                            <Lock size={18} color="#94a3b8" />
                            <TextInput
                                ref={passwordRef}
                                testID="input-password"
                                style={s.input}
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Masukkan kata sandi"
                                placeholderTextColor="#a0aec0"
                                autoCapitalize="none"
                                autoCorrect={false}
                                textContentType="password"
                                secureTextEntry={!showPassword}
                                returnKeyType="done"
                                onSubmitEditing={handleLogin}
                                editable={!loading}
                                accessibilityLabel="Kata sandi"
                            />
                            <TouchableOpacity
                                style={s.passwordToggle}
                                onPress={() => setShowPassword((v) => !v)}
                                accessibilityLabel={
                                    showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                                }
                                accessibilityRole="button"
                            >
                                {showPassword ? (
                                    <EyeOff size={18} color={iconColors.muted} />
                                ) : (
                                    <Eye size={18} color={iconColors.muted} />
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Submit */}
                        <TouchableOpacity
                            testID="btn-login"
                            style={[s.btnLogin, loading && s.btnDisabled]}
                            onPress={handleLogin}
                            disabled={loading}
                            activeOpacity={0.85}
                            accessibilityLabel="Masuk ke sistem"
                            accessibilityRole="button"
                        >
                            <LinearGradient
                                colors={["#2b55e6", "#3d68fb", "#5479ff"]}
                                start={{x: 0, y: 0}}
                                end={{x: 1, y: 1}}
                                style={s.btnGradient}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#ffffff" />
                                ) : (
                                    <View style={s.btnContent}>
                                        <Text style={s.btnLoginText}>Masuk Sekarang</Text>
                                        <LogIn size={18} color={iconColors.white} />
                                    </View>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        <Text style={s.accessNote}>
                            Aplikasi ini khusus untuk akun Guru.
                        </Text>
                    </View>
                </Animated.View>

                {/* ═══════ Server Settings ═══════ */}
                <TouchableOpacity
                    testID="btn-server-settings"
                    style={s.settingsButton}
                    onPress={() => navigation.navigate("ServerSetup")}
                    activeOpacity={0.7}
                    accessibilityLabel="Pengaturan server"
                    accessibilityRole="button"
                >
                    <View style={s.settingsIcon}>
                        <Settings size={18} color={iconColors.primaryDark} />
                    </View>
                    <View style={s.settingsCopy}>
                        <Text style={s.settingsTitle}>Pengaturan server</Text>
                        <Text style={s.settingsSubtitle} numberOfLines={1}>
                            {serverUrl
                                ? `Terhubung: ${serverUrl}`
                                : "Ganti atau konfigurasi server"}
                        </Text>
                    </View>
                    <Text style={s.settingsAction}>Atur</Text>
                </TouchableOpacity>

                <Text style={s.footerText}>Presensi sekolah · Intranet lokal</Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* ───────────────────────────────────────────────
   Styles
   ─────────────────────────────────────────────── */
const s = StyleSheet.create({
    /* ---- Layout ---- */
    container: {flex: 1, backgroundColor: "#f1f5f9"},
    scroll: {
        flexGrow: 1,
        paddingBottom: 24,
    },

    /* ---- Hero ---- */
    hero: {
        position: "relative",
        paddingTop: Platform.OS === "ios" ? 60 : 44,
        paddingBottom: 72,
        paddingHorizontal: 28,
        alignItems: "center",
        overflow: "hidden",
    },

    gridOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-around",
        alignContent: "space-around",
        paddingHorizontal: 10,
        paddingVertical: 10,
        opacity: 0.4,
    },
    gridDot: {
        width: 2,
        height: 2,
        borderRadius: 1,
        backgroundColor: "rgba(255,255,255,0.12)",
        margin: 10,
    },

    illustrationWrap: {
        alignItems: "center",
        marginBottom: 18,
    },
    illustration: {
        width: 68,
        height: 68,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOpacity: 0.25,
                shadowOffset: {width: 0, height: 8},
                shadowRadius: 20,
            },
            android: {elevation: 8},
        }),
    },
    illustrationInner: {
        width: 52,
        height: 52,
        borderRadius: 15,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "rgba(255,255,255,0.1)",
        alignItems: "center",
        justifyContent: "center",
    },

    heroBrand: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
    },
    logoFrame: {
        width: 42,
        height: 42,
        borderRadius: 13,
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
        ...Platform.select({
            ios: {
                shadowColor: "#09132d",
                shadowOpacity: 0.3,
                shadowOffset: {width: 0, height: 4},
                shadowRadius: 10,
            },
            android: {elevation: 5},
        }),
    },
    logo: {width: 42, height: 42, borderRadius: 6},

    brandName: {
        color: "#ffffff",
        fontSize: 19,
        fontWeight: "800",
        letterSpacing: 1,
        lineHeight: 22,
    },
    brandSub: {
        color: "#8ea4cf",
        fontSize: 10.5,
        fontWeight: "500",
        marginTop: 1,
    },

    heroEyebrow: {
        color: "#7ea0e8",
        fontSize: 9,
        fontWeight: "800",
        letterSpacing: 2.5,
        marginBottom: 6,
    },
    heroTitle: {
        color: "#eaf0ff",
        fontSize: 22,
        fontWeight: "800",
        textAlign: "center",
        lineHeight: 29,
        letterSpacing: -0.3,
        maxWidth: 260,
    },

    wave: {
        position: "absolute",
        bottom: -1,
        left: "-8%",
        width: "116%",
        height: 44,
        backgroundColor: "#f1f5f9",
        borderTopLeftRadius: 9999,
        borderTopRightRadius: 9999,
    },

    /* ---- Card ---- */
    cardOuter: {
        paddingHorizontal: 18,
        marginTop: -28,
        zIndex: 3,
    },
    card: {
        backgroundColor: "#ffffff",
        borderRadius: 22,
        padding: 26,
        ...Platform.select({
            ios: {
                shadowColor: "#16213b",
                shadowOpacity: 0.1,
                shadowOffset: {width: 0, height: 10},
                shadowRadius: 30,
            },
            android: {elevation: 8},
        }),
    },

    cardHeading: {alignItems: "center", marginBottom: 24},
    badge: {
        backgroundColor: "#eef2ff",
        paddingHorizontal: 14,
        paddingVertical: 5,
        borderRadius: 20,
        marginBottom: 10,
    },
    badgeText: {
        color: "#315efb",
        fontSize: 9,
        fontWeight: "900",
        letterSpacing: 2,
    },
    cardTitle: {
        color: "#0f172a",
        fontSize: 22,
        fontWeight: "800",
        marginBottom: 4,
    },
    cardSubtitle: {color: "#8d99b0", fontSize: 12.5, lineHeight: 18},

    /* Error */
    errorBox: {
        backgroundColor: "#fff5f5",
        borderColor: "#fed7d7",
        borderWidth: 1.5,
        borderRadius: 14,
        padding: 13,
        marginBottom: 16,
    },
    errorBoxText: {color: "#c53030", fontSize: 12.5, lineHeight: 18},

    /* Inputs */
    label: {
        color: "#475569",
        fontSize: 11.5,
        fontWeight: "700",
        letterSpacing: 0.3,
        marginBottom: 6,
    },
    inputRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: "#f8fafc",
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: "#e2e8f0",
        paddingLeft: 14,
        minHeight: 54,
        marginBottom: 16,
    },
    input: {
        flex: 1,
        minHeight: MIN_TOUCH,
        paddingVertical: 10,
        fontSize: 14.5,
        color: "#0f172a",
    },
    passwordToggle: {
        width: MIN_TOUCH,
        minHeight: MIN_TOUCH,
        alignItems: "center",
        justifyContent: "center",
    },

    /* Button */
    btnLogin: {
        borderRadius: 14,
        overflow: "hidden",
        marginTop: 4,
        ...Platform.select({
            ios: {
                shadowColor: "#2b55e6",
                shadowOpacity: 0.3,
                shadowOffset: {width: 0, height: 5},
                shadowRadius: 12,
            },
            android: {elevation: 6},
        }),
    },
    btnGradient: {
        minHeight: 54,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
    },
    btnDisabled: {opacity: 0.65},
    btnContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    btnLoginText: {color: "#ffffff", fontWeight: "800", fontSize: 15},
    accessNote: {
        color: "#a0aec0",
        fontSize: 11.5,
        textAlign: "center",
        marginTop: 14,
    },

    /* Server settings */
    settingsButton: {
        flexDirection: "row",
        alignItems: "center",
        minHeight: 64,
        marginTop: 18,
        marginHorizontal: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        borderRadius: 16,
        ...Platform.select({
            ios: {
                shadowColor: "#16213b",
                shadowOpacity: 0.04,
                shadowOffset: {width: 0, height: 2},
                shadowRadius: 8,
            },
            android: {elevation: 2},
        }),
    },
    settingsIcon: {
        width: 42,
        height: 42,
        borderRadius: 13,
        backgroundColor: "#eff6ff",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    settingsCopy: {flex: 1},
    settingsTitle: {color: "#1e293b", fontSize: 13, fontWeight: "700"},
    settingsSubtitle: {color: "#64748b", fontSize: 11, marginTop: 3},
    settingsAction: {
        color: "#2563eb",
        fontSize: 12,
        fontWeight: "700",
        paddingHorizontal: 8,
    },

    footerText: {
        color: "#94a3b8",
        fontSize: 11,
        textAlign: "center",
        marginTop: 18,
        marginBottom: 8,
    },
});
