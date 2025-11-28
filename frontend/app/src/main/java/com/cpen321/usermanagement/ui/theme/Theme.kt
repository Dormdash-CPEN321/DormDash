package com.cpen321.usermanagement.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    // Royal blue theme for light mode
    primary = Color(0xFF3A7BD5),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFD8E9FF),
    onPrimaryContainer = Color(0xFF002D5C),
    
    // Lighter blue for secondary actions (better contrast)
    secondary = Color(0xFF5C9EFF),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFD8E9FF),
    onSecondaryContainer = Color(0xFF002D5C),
    
    // Slate blue for tertiary
    tertiary = Color(0xFF4A6FA5),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFD6E3F0),
    onTertiaryContainer = Color(0xFF001633),
    
    // Error states
    error = Color(0xFFBA1A1A),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
    
    // Backgrounds - Clean white with subtle blue tint
    background = Color(0xFFFCFCFF),
    onBackground = Color(0xFF1A1C1E),
    
    // Surfaces - White with blue undertone
    surface = Color(0xFFFCFCFF),
    onSurface = Color(0xFF1A1C1E),
    surfaceVariant = Color(0xFFE7EEFF),
    onSurfaceVariant = Color(0xFF44474E),
    
    // Borders and dividers
    outline = Color(0xFF74777F),
    outlineVariant = Color(0xFFC4C6CF),
    
    scrim = Color(0xFF000000),
    inverseSurface = Color(0xFF2F3033),
    inverseOnSurface = Color(0xFFF1F0F4),
    inversePrimary = Color(0xFF5C9EFF),
    
    surfaceTint = Color(0xFF3A7BD5)
)

private val DarkColorScheme = darkColorScheme(
    // Royal blue theme - modern and professional
    primary = Color(0xFF5C9EFF),
    onPrimary = Color(0xFF002D5C),
    primaryContainer = Color(0xFF3A7BD5),
    onPrimaryContainer = Color(0xFFD8E9FF),
    
    // Darker blue accent for buttons and variety
    secondary = Color(0xFF2A5F8F),
    onSecondary = Color(0xFFE8F3F5),
    secondaryContainer = Color(0xFF1A4566),
    onSecondaryContainer = Color(0xFFD0E5F2),
    
    // Deep navy blue for tertiary elements
    tertiary = Color(0xFF4A6FA5),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFF2E4A6E),
    onTertiaryContainer = Color(0xFFD6E3F0),
    
    // Error states - Muted red that fits the blue theme
    error = Color(0xFFE57373),
    onError = Color(0xFF3D0000),
    errorContainer = Color(0xFF8B3A3A),
    onErrorContainer = Color(0xFFFFCDD2),
    
    // Backgrounds - Rich dark with blue tint
    background = Color(0xFF0D1117),
    onBackground = Color(0xFFE8EEFF),
    
    // Surfaces - Elevated dark with blue tone
    surface = Color(0xFF161B22),
    onSurface = Color(0xFFE8EEFF),
    surfaceVariant = Color(0xFF1F252E),
    onSurfaceVariant = Color(0xFFD0DDEB),
    
    // Borders and dividers with blue tint
    outline = Color(0xFF5A6B7D),
    outlineVariant = Color(0xFF2D3845),
    
    scrim = Color(0xFF000000),
    inverseSurface = Color(0xFFE8EEFF),
    inverseOnSurface = Color(0xFF161B22),
    inversePrimary = Color(0xFF3A7BD5),
    
    surfaceTint = Color(0xFF5C9EFF),
    
    // Additional surface variations for depth with blue undertones
    surfaceBright = Color(0xFF262D38),
    surfaceDim = Color(0xFF080B0F),
    surfaceContainer = Color(0xFF161B22),
    surfaceContainerHigh = Color(0xFF1F252E),
    surfaceContainerHighest = Color(0xFF2A313C),
    surfaceContainerLow = Color(0xFF12171D),
    surfaceContainerLowest = Color(0xFF04060A)
)

data class Spacing(
    val none: Dp = 0.dp,
    val extraSmall: Dp = 4.dp,
    val small: Dp = 8.dp,
    val medium: Dp = 16.dp,
    val large: Dp = 24.dp,
    val extraLarge: Dp = 32.dp,
    val extraLarge2: Dp = 48.dp,
    val extraLarge3: Dp = 64.dp,
    val extraLarge4: Dp = 96.dp,
    val extraLarge5: Dp = 120.dp,
)

data class FontSizes(
    val extraSmall: androidx.compose.ui.unit.TextUnit = 10.sp,
    val small: androidx.compose.ui.unit.TextUnit = 12.sp,
    val medium: androidx.compose.ui.unit.TextUnit = 14.sp,
    val regular: androidx.compose.ui.unit.TextUnit = 16.sp,
    val large: androidx.compose.ui.unit.TextUnit = 18.sp,
    val extraLarge: androidx.compose.ui.unit.TextUnit = 20.sp,
    val extraLarge2: androidx.compose.ui.unit.TextUnit = 24.sp,
    val extraLarge3: androidx.compose.ui.unit.TextUnit = 32.sp,
    val extraLarge4: androidx.compose.ui.unit.TextUnit = 48.sp,
)

val LocalSpacing = staticCompositionLocalOf { Spacing() }
val LocalFontSizes = staticCompositionLocalOf { FontSizes() }

@Composable
fun ProvideSpacing(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalSpacing provides Spacing()) {
        content()
    }
}

@Composable
fun ProvideFontSizes(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalFontSizes provides FontSizes()) {
        content()
    }
}

@Composable
fun UserManagementTheme(
    darkTheme: Boolean = false, 
    content: @Composable () -> Unit
) {
    val colorScheme = LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            val insetsController = WindowCompat.getInsetsController(window, view)

            WindowCompat.setDecorFitsSystemWindows(window, false)

            insetsController.isAppearanceLightStatusBars = !darkTheme

            if (Build.VERSION.SDK_INT < 35) {
                @Suppress("DEPRECATION")
                window.statusBarColor = android.graphics.Color.TRANSPARENT
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
