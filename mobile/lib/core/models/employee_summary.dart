/// `listEmployeesByDepartment` callable qaytaradigan minimal, maxfiy
/// bo'lmagan ma'lumot — bo'lim tanlangach ism-familiya ro'yxati uchun.
/// To'liq xodim hujjati (telefon, maosh) faqat autentifikatsiyadan keyin,
/// admin panelda ko'rinadi.
class EmployeeSummary {
  final String id;
  final String fullName;
  // Faqat "Boshqa" (aralash kasblar) ro'yxatida keladi — har bir xodimning
  // aynan qaysi kasbda ekanini ko'rsatish uchun (bo'lim bo'yicha oddiy
  // ro'yxatlarda hammasi bir xil bo'lgani uchun kerak emas).
  final String? departmentLabel;
  // Talab: "Joyida yuvish" jamoasiga faqat admin ruxsat bergan xodimlar
  // qo'shilishi mumkin — jamoa biriktirish ro'yxatida shu bayroqqa qarab
  // ruxsati yo'qlar bloklangan/qizil ko'rsatiladi (team_assign_sheet.dart).
  final bool canDoOnsiteWashing;

  const EmployeeSummary({
    required this.id,
    required this.fullName,
    this.departmentLabel,
    this.canDoOnsiteWashing = false,
  });

  factory EmployeeSummary.fromMap(Map<Object?, Object?> map) {
    return EmployeeSummary(
      id: map['id'] as String,
      fullName: map['fullName'] as String? ?? "Noma'lum",
      departmentLabel: map['departmentLabel'] as String?,
      canDoOnsiteWashing: map['canDoOnsiteWashing'] as bool? ?? false,
    );
  }

  /// Qurilmada saqlash uchun (internetsiz ro'yxat) — [EmployeeSummary.fromMap] teskarisi.
  Map<String, dynamic> toMap() => {
        'id': id,
        'fullName': fullName,
        if (departmentLabel != null) 'departmentLabel': departmentLabel,
        'canDoOnsiteWashing': canDoOnsiteWashing,
      };
}

/// PIN tekshirilgach token orqali olinadigan custom-claims ma'lumoti.
class EmployeeClaims {
  final String employeeId;
  final String role;
  final String department;

  const EmployeeClaims({required this.employeeId, required this.role, required this.department});

  /// Token claim'laridan — xodim tokeni bo'lmasa (masalan admin) `null`.
  static EmployeeClaims? fromClaims(Map<String, dynamic>? claims) {
    final employeeId = claims?['employeeId'];
    if (employeeId is! String) return null;
    return EmployeeClaims(
      employeeId: employeeId,
      role: claims!['role']?.toString() ?? '',
      department: claims['department']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {'employeeId': employeeId, 'role': role, 'department': department};

  static EmployeeClaims? fromJson(Map<String, dynamic>? json) => fromClaims(json);
}
