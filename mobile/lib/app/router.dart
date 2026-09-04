import 'package:go_router/go_router.dart';

import '../core/config.dart';
import '../features/admin/admin_panel_screen.dart';
import '../features/auth/employee_list_screen.dart';
import '../features/auth/pin_entry_screen.dart';
import '../features/home/employee_home_screen.dart';
import '../features/profile/employee_profile_screen.dart';
import '../features/role_select/role_select_screen.dart';
import '../features/splash/splash_screen.dart';
import '../features/stats/daily_stats_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/select', builder: (context, state) => const RoleSelectScreen()),
    GoRoute(
      path: '/employees/:department',
      builder: (context, state) => EmployeeListScreen(
        departmentName: state.pathParameters['department']!,
      ),
    ),
    GoRoute(
      path: '/pin/:employeeId',
      builder: (context, state) => PinEntryScreen(
        employeeId: state.pathParameters['employeeId']!,
        employeeName: state.extra as String? ?? '',
      ),
    ),
    GoRoute(path: '/home', builder: (context, state) => const EmployeeHomeScreen()),
    GoRoute(path: '/profile', builder: (context, state) => const EmployeeProfileScreen()),
    GoRoute(path: '/stats', builder: (context, state) => const DailyStatsScreen()),
    // Faqat ADMIN_PANEL bayrog'i yoqilgan buildda mavjud — oddiy
    // buildda marshrut ham, unga olib boradigan tugma ham yo'q, ya'ni
    // xodim uni manzil orqali ham topa olmaydi.
    if (kAdminPanelEnabled)
      GoRoute(path: '/admin-panel', builder: (context, state) => const AdminPanelScreen()),
  ],
);
