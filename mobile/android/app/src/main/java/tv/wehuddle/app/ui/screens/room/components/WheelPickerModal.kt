package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import tv.wehuddle.app.data.model.WheelSpinData
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.theme.*

@Composable
fun WheelPickerModal(
    entries: List<String>,
    entryInput: String,
    lastSpin: WheelSpinData?,
    onEntryInputChange: (String) -> Unit,
    onAddEntry: () -> Unit,
    onRemoveEntry: (Int) -> Unit,
    onClearAll: () -> Unit,
    onSpin: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Black50)
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            GlassCard(
                modifier = Modifier
                    .widthIn(max = 400.dp)
                    .heightIn(max = 600.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Casino,
                            contentDescription = null,
                            tint = Slate200,
                            modifier = Modifier.size(24.dp)
                        )
                        Text(
                            text = "Wheel Picker",
                            style = TextStyle(
                                color = Slate50,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        )
                    }
                    
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = Slate400
                        )
                    }
                }
                
                Spacer(Modifier.height(16.dp))
                
                // Last spin result
                if (lastSpin != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Emerald500.copy(alpha = 0.15f))
                            .border(1.dp, Emerald500.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "🎉 Winner!",
                                style = TextStyle(
                                    color = Emerald200,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = lastSpin.result,
                                style = TextStyle(
                                    color = Slate50,
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            )
                        }
                    }
                    
                    Spacer(Modifier.height(16.dp))
                }
                
                // Add entry input
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    HuddleTextField(
                        value = entryInput,
                        onValueChange = onEntryInputChange,
                        placeholder = "Enter item name",
                        modifier = Modifier.weight(1f)
                    )
                    
                    HuddleSecondaryButton(
                        onClick = onAddEntry,
                        enabled = entryInput.isNotBlank()
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Add",
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text("Add", style = TextStyle(fontWeight = FontWeight.Medium))
                    }
                }
                
                Spacer(Modifier.height(16.dp))
                
                // Entries list
                if (entries.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(120.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Black20)
                            .border(1.dp, White10, RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.List,
                                contentDescription = null,
                                tint = Slate500,
                                modifier = Modifier.size(32.dp)
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = "No entries yet",
                                style = TextStyle(
                                    color = Slate400,
                                    fontSize = 14.sp
                                )
                            )
                            Text(
                                text = "Add items to spin the wheel",
                                style = TextStyle(
                                    color = Slate500,
                                    fontSize = 12.sp
                                )
                            )
                        }
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                    ) {
                        itemsIndexed(entries) { index, entry ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Black20)
                                    .border(1.dp, White10, RoundedCornerShape(12.dp))
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "${index + 1}",
                                        style = TextStyle(
                                            color = Slate500,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium
                                        ),
                                        modifier = Modifier.width(24.dp),
                                        textAlign = TextAlign.Center
                                    )
                                    Text(
                                        text = entry,
                                        style = TextStyle(
                                            color = Slate200,
                                            fontSize = 14.sp
                                        )
                                    )
                                }
                                
                                IconButton(
                                    onClick = { onRemoveEntry(index) },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Remove",
                                        tint = Slate500,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
                
                Spacer(Modifier.height(16.dp))
                
                // Action buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (entries.isNotEmpty()) {
                        HuddleSecondaryButton(
                            onClick = onClearAll,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Clear all", style = TextStyle(fontWeight = FontWeight.Medium))
                        }
                    }
                    
                    HuddlePrimaryButton(
                        onClick = onSpin,
                        enabled = entries.size >= 2,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Casino,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("Spin", style = TextStyle(fontWeight = FontWeight.SemiBold))
                    }
                }
                
                if (entries.size < 2 && entries.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Add at least 2 entries to spin",
                        style = TextStyle(
                            color = Slate500,
                            fontSize = 12.sp
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}
