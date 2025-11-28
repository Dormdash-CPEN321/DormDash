package com.cpen321.usermanagement.data.local.models

import java.time.DayOfWeek
import java.time.LocalTime

data class TimeSlot(
    val startTime: LocalTime,
    val endTime: LocalTime
)

data class DayAvailability(
    val day: DayOfWeek,
    val timeSlots: List<TimeSlot> = emptyList()
)

data class MoverAvailability(
    val moverId: String,
    val availableDays: List<DayAvailability> = emptyList()
)
