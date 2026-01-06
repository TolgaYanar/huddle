package tv.wehuddle.app.ui.screens.room.components

import android.util.Log
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import tv.wehuddle.app.data.model.WheelSpinData
import tv.wehuddle.app.data.model.WheelSpunData
import tv.wehuddle.app.ui.theme.*
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private const val SPIN_DURATION_MS = 3600

/**
 * Generate a color for a wheel wedge based on index
 */
private fun colorForIndex(index: Int): WedgeColors {
    val hue = (index * 47) % 360
    return WedgeColors(
        wedge = Color.hsl(hue.toFloat(), 0.9f, 0.55f, 0.38f),
        chip = Color.hsl(hue.toFloat(), 0.9f, 0.6f, 0.22f),
        border = Color.hsl(hue.toFloat(), 0.9f, 0.6f, 0.35f)
    )
}

private data class WedgeColors(
    val wedge: Color,
    val chip: Color,
    val border: Color
)

@Composable
fun AnimatedWheelPickerModal(
    entries: List<String>,
    entryInput: String,
    lastSpin: WheelSpunData?,
    isConnected: Boolean,
    onEntryInputChange: (String) -> Unit,
    onAddEntry: () -> Unit,
    onRemoveEntry: (Int) -> Unit,
    onClearAll: () -> Unit,
    onSpin: () -> Unit,
    onDismiss: () -> Unit
) {
    // Animation state
    var wheelRotation by remember { mutableFloatStateOf(0f) }
    var isSpinning by remember { mutableStateOf(false) }
    var revealedPick by remember { mutableStateOf<String?>(null) }
    var frozenEntries by remember { mutableStateOf<List<String>>(emptyList()) }
    var lastSpinToken by remember { mutableLongStateOf(0L) }

    val effectiveEntries = if (isSpinning) frozenEntries else entries

    // Animated rotation
    val animatedRotation by animateFloatAsState(
        targetValue = wheelRotation,
        animationSpec = tween(
            durationMillis = SPIN_DURATION_MS,
            easing = CubicBezierEasing(0.15f, 0.9f, 0.15f, 1f)
        ),
        finishedListener = {
            isSpinning = false
            revealedPick = lastSpin?.result
        },
        label = "wheel_rotation"
    )

    // Handle incoming spin events
    LaunchedEffect(lastSpin?.spunAt) {
        if (lastSpin == null) return@LaunchedEffect
        if (lastSpinToken == lastSpin.spunAt) return@LaunchedEffect
        lastSpinToken = lastSpin.spunAt

        isSpinning = true
        revealedPick = null

        // Freeze entries for this spin
        frozenEntries = lastSpin.entries?.takeIf { it.isNotEmpty() } ?: entries

        val count = when {
            lastSpin.entryCount > 0 -> lastSpin.entryCount
            !lastSpin.entries.isNullOrEmpty() -> lastSpin.entries.size
            else -> entries.size
        }
        if (count <= 0) return@LaunchedEffect

        val seg = 360f / count
        val index = lastSpin.index.coerceIn(0, count - 1)
        val centerDeg = index * seg + seg / 2
        val target = 360f - centerDeg
        val extraTurns = 6 * 360f

        // Calculate new rotation maintaining final position
        val currentMod = ((wheelRotation % 360f) + 360f) % 360f
        val desiredMod = ((target % 360f) + 360f) % 360f
        val delta = (desiredMod - currentMod + 360f) % 360f

        wheelRotation += extraTurns + delta
    }

    // Winner info
    val winnerIndex = lastSpin?.index
    val normalizedWinnerIndex = if (winnerIndex != null && effectiveEntries.isNotEmpty()) {
        ((winnerIndex % effectiveEntries.size) + effectiveEntries.size) % effectiveEntries.size
    } else null
    val winnerColor = normalizedWinnerIndex?.let { colorForIndex(it) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Black50)
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .widthIn(max = 440.dp)
                    .fillMaxHeight(0.9f),
                shape = RoundedCornerShape(24.dp),
                color = Color.Black.copy(alpha = 0.4f),
                border = androidx.compose.foundation.BorderStroke(1.dp, White10)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    // Header
                    Surface(
                        color = Color.Black.copy(alpha = 0.2f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Wheel Picker",
                                    style = TextStyle(
                                        color = Slate50,
                                        fontSize = 20.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                )
                                Text(
                                    text = "Add entries one by one, then spin.",
                                    style = TextStyle(
                                        color = Slate300,
                                        fontSize = 14.sp
                                    )
                                )
                            }

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = { onClearAll() },
                                    enabled = isConnected && entries.isNotEmpty() && !isSpinning,
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        contentColor = Slate100
                                    ),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, White10),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text("Clear")
                                }
                                OutlinedButton(
                                    onClick = { onDismiss() },
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        contentColor = Slate100
                                    ),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, White10),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text("Close")
                                }
                            }
                        }
                    }

                    HorizontalDivider(color = White10)

                    // Content - Two columns on larger screens, stacked on mobile
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        // Wheel Section
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            // Wheel with pointer
                            Box(
                                modifier = Modifier.size(240.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                // Pointer triangle at top
                                Canvas(
                                    modifier = Modifier
                                        .align(Alignment.TopCenter)
                                        .offset(y = (-8).dp)
                                        .size(24.dp, 20.dp)
                                ) {
                                    val path = Path().apply {
                                        moveTo(size.width / 2, size.height)
                                        lineTo(0f, 0f)
                                        lineTo(size.width, 0f)
                                        close()
                                    }
                                    drawPath(path, Color.White.copy(alpha = 0.6f))
                                }

                                // Wheel
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .clip(CircleShape)
                                        .border(1.dp, White10, CircleShape)
                                        .background(Color.Black.copy(alpha = 0.3f))
                                ) {
                                    SpinningWheel(
                                        entries = effectiveEntries,
                                        rotation = animatedRotation,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }

                                // Center label
                                Surface(
                                    shape = RoundedCornerShape(16.dp),
                                    color = Color.Black.copy(alpha = 0.6f),
                                    border = androidx.compose.foundation.BorderStroke(1.dp, White10)
                                ) {
                                    Text(
                                        text = "${effectiveEntries.size} entries",
                                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                        style = TextStyle(
                                            color = Slate100,
                                            fontSize = 14.sp
                                        )
                                    )
                                }
                            }

                            // Spin Button
                            Button(
                                onClick = { 
                                    Log.d("WheelPicker", "Spin button clicked!")
                                    onSpin() 
                                },
                                enabled = isConnected && entries.isNotEmpty() && !isSpinning,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(16.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = White5,
                                    contentColor = Slate50
                                )
                            ) {
                                Text(
                                    text = if (isSpinning) "Spinning…" else "Spin",
                                    style = TextStyle(
                                        fontWeight = FontWeight.SemiBold,
                                        fontSize = 16.sp
                                    )
                                )
                            }

                            // Result Box
                            Surface(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(16.dp),
                                color = Color.Black.copy(alpha = 0.2f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, White10)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(
                                        text = "RESULT",
                                        style = TextStyle(
                                            color = Slate400,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            letterSpacing = 1.sp
                                        )
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        if (winnerColor != null && revealedPick != null) {
                                            Box(
                                                modifier = Modifier
                                                    .size(12.dp)
                                                    .clip(CircleShape)
                                                    .background(winnerColor.chip)
                                                    .border(1.dp, winnerColor.border, CircleShape)
                                            )
                                        }
                                        Text(
                                            text = when {
                                                revealedPick != null -> revealedPick!!
                                                isSpinning -> "…"
                                                else -> ""
                                            },
                                            style = TextStyle(
                                                color = Slate100,
                                                fontSize = 18.sp,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        )
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        text = "Result appears only after the wheel stops.",
                                        style = TextStyle(
                                            color = Slate400,
                                            fontSize = 12.sp
                                        )
                                    )
                                }
                            }
                        }

                        // Entries Section
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            // Input Row
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                OutlinedTextField(
                                    value = entryInput,
                                    onValueChange = onEntryInputChange,
                                    placeholder = {
                                        Text(
                                            if (isConnected) "Add entry…" else "Connecting…",
                                            color = Slate500
                                        )
                                    },
                                    enabled = isConnected && !isSpinning,
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(56.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Color(0xFF0EA5E9).copy(alpha = 0.3f),
                                        unfocusedBorderColor = White10,
                                        focusedTextColor = Slate200,
                                        unfocusedTextColor = Slate200,
                                        cursorColor = Color(0xFF0EA5E9)
                                    ),
                                    shape = RoundedCornerShape(16.dp),
                                    singleLine = true,
                                    textStyle = TextStyle(fontSize = 16.sp),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(
                                        onDone = {
                                            Log.d("WheelPicker", "Keyboard Done pressed, input='$entryInput'")
                                            if (entryInput.isNotBlank()) {
                                                onAddEntry()
                                            }
                                        }
                                    )
                                )
                                Button(
                                    onClick = { 
                                        Log.d("WheelPicker", "Add button clicked! input='$entryInput'")
                                        onAddEntry() 
                                    },
                                    enabled = isConnected && !isSpinning && entryInput.isNotBlank(),
                                    modifier = Modifier.height(56.dp),
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Indigo500,
                                        contentColor = Slate50,
                                        disabledContainerColor = Slate700,
                                        disabledContentColor = Slate500
                                    ),
                                    shape = RoundedCornerShape(16.dp)
                                ) {
                                    Text("Add", fontWeight = FontWeight.SemiBold)
                                }
                            }

                            // Entries List
                            Surface(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f),
                                shape = RoundedCornerShape(16.dp),
                                color = Color.Black.copy(alpha = 0.2f),
                                border = androidx.compose.foundation.BorderStroke(1.dp, White10)
                            ) {
                                Column {
                                    // List header
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            "Entries",
                                            style = TextStyle(color = Slate300, fontSize = 14.sp)
                                        )
                                        Text(
                                            "Click remove",
                                            style = TextStyle(color = Slate500, fontSize = 12.sp)
                                        )
                                    }
                                    HorizontalDivider(color = White10)

                                    if (effectiveEntries.isEmpty()) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .weight(1f),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                "No entries yet.",
                                                style = TextStyle(color = Slate500, fontSize = 14.sp)
                                            )
                                        }
                                    } else {
                                        LazyColumn(
                                            modifier = Modifier.weight(1f)
                                        ) {
                                            itemsIndexed(effectiveEntries) { idx, entry ->
                                                val c = colorForIndex(idx)
                                                val isWinner = revealedPick != null && normalizedWinnerIndex == idx

                                                Row(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .background(if (isWinner) White5 else Color.Transparent)
                                                        .padding(horizontal = 16.dp, vertical = 12.dp),
                                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .size(12.dp)
                                                            .clip(CircleShape)
                                                            .background(c.chip)
                                                            .border(1.dp, c.border, CircleShape)
                                                    )
                                                    Text(
                                                        text = entry,
                                                        modifier = Modifier.weight(1f),
                                                        style = TextStyle(
                                                            color = Slate100,
                                                            fontSize = 14.sp
                                                        ),
                                                        maxLines = 1
                                                    )
                                                    OutlinedButton(
                                                        onClick = { onRemoveEntry(idx) },
                                                        enabled = isConnected && !isSpinning,
                                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                                                        colors = ButtonDefaults.outlinedButtonColors(
                                                            contentColor = Slate50
                                                        ),
                                                        border = androidx.compose.foundation.BorderStroke(1.dp, White10),
                                                        shape = RoundedCornerShape(12.dp)
                                                    ) {
                                                        Text(
                                                            "Remove",
                                                            style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                                        )
                                                    }
                                                }
                                                if (idx < effectiveEntries.lastIndex) {
                                                    HorizontalDivider(color = White10)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SpinningWheel(
    entries: List<String>,
    rotation: Float,
    modifier: Modifier = Modifier
) {
    Canvas(
        modifier = modifier.rotate(rotation)
    ) {
        val count = entries.size
        if (count <= 0) {
            // Empty wheel
            drawCircle(Color.White.copy(alpha = 0.1f))
            return@Canvas
        }

        if (count > 80) {
            // Too many entries - use simplified pattern
            drawRepeatingPattern()
            return@Canvas
        }

        val sweepAngle = 360f / count
        entries.forEachIndexed { index, _ ->
            val startAngle = index * sweepAngle - 90f // Start from top
            val color = colorForIndex(index).wedge

            drawArc(
                color = color,
                startAngle = startAngle,
                sweepAngle = sweepAngle,
                useCenter = true,
                size = Size(size.width, size.height)
            )
        }
    }
}

private fun DrawScope.drawRepeatingPattern() {
    val segmentCount = 30
    val sweepAngle = 360f / segmentCount
    
    for (i in 0 until segmentCount) {
        val startAngle = i * sweepAngle - 90f
        val color = if (i % 2 == 0) {
            Color.White.copy(alpha = 0.12f)
        } else {
            Color.White.copy(alpha = 0.06f)
        }
        
        drawArc(
            color = color,
            startAngle = startAngle,
            sweepAngle = sweepAngle,
            useCenter = true,
            size = Size(size.width, size.height)
        )
    }
}
