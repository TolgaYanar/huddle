package tv.wehuddle.app.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tv.wehuddle.app.data.model.PlatformType
import tv.wehuddle.app.data.model.platformAndroidPackage
import tv.wehuddle.app.data.model.platformDisplayName
import tv.wehuddle.app.ui.theme.*

private const val TAG = "Tier3CtaCard"

/**
 * In-room placeholder shown for DRM-protected sources we can't play inline
 * (Disney+, HBO Max, Hulu, Apple TV+, Paramount+, Peacock, and Prime Video).
 *
 * Netflix on Android does *not* reach this card — `NetflixWebPlayer` handles
 * it via the WebView + JS-bridge Rave pattern. Everything else falls here
 * because we don't ship a dedicated player for them yet. The CTA mirrors the
 * web app's `Tier3CtaCard` design: explain *why* it can't embed, then offer
 * to launch the user into the platform's native app (preferred, falls back
 * to browser if the app isn't installed).
 */
@Composable
fun Tier3CtaCard(
    platform: PlatformType,
    url: String,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val name = platformDisplayName(platform)
    val androidPackage = platformAndroidPackage(platform)

    Box(
        modifier = modifier
            .background(Slate950)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 380.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(White5)
                .border(1.dp, White10, RoundedCornerShape(20.dp))
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Amber500.copy(alpha = 0.15f))
                        .border(1.dp, Amber500.copy(alpha = 0.30f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Lock,
                        contentDescription = null,
                        tint = Amber200,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "$name can't play inside Huddle",
                        style = TextStyle(
                            color = Slate50,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "$name is DRM-protected, so we can't embed its " +
                            "player inside the app. Open it in $name's own app and " +
                            "keep using Huddle for chat, voice, and reactions.",
                        style = TextStyle(
                            color = Slate400,
                            fontSize = 12.sp,
                            lineHeight = 18.sp,
                        ),
                    )
                }
            }

            // Primary: try the platform's native Android app first; fall back
            // to the browser if it isn't installed.
            HuddlePrimaryButton(
                onClick = {
                    openInPlatformApp(
                        context = context,
                        url = url,
                        preferredPackage = androidPackage,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.OpenInNew,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = if (androidPackage != null) "Open in $name app"
                        else "Open $name",
                        style = TextStyle(fontWeight = FontWeight.SemiBold),
                    )
                }
            }

            // Secondary: explicitly force the browser, in case the app version
            // is broken or the user prefers the web player.
            HuddleSecondaryButton(
                onClick = { openInBrowser(context, url) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = "Open in browser",
                    style = TextStyle(fontWeight = FontWeight.Medium),
                )
            }

            Text(
                text = "The room's chat, voice, and reactions all keep " +
                    "working while $name plays in its own app.",
                style = TextStyle(
                    color = Slate500,
                    fontSize = 11.sp,
                    lineHeight = 16.sp,
                ),
            )
        }
    }
}

private fun openInPlatformApp(
    context: Context,
    url: String,
    preferredPackage: String?,
) {
    if (preferredPackage != null) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                setPackage(preferredPackage)
            }
            context.startActivity(intent)
            return
        } catch (e: ActivityNotFoundException) {
            Log.d(TAG, "Platform app $preferredPackage not installed, falling back")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to launch $preferredPackage", e)
        }
    }
    // Fallback: let the system pick a handler (browser, or another app
    // that registered the host).
    openInBrowser(context, url)
}

private fun openInBrowser(context: Context, url: String) {
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    } catch (e: Exception) {
        Log.e(TAG, "Failed to open URL externally: $url", e)
    }
}
