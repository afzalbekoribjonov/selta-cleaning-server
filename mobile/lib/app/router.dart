import 'package:go_router/go_router.dart';

import '../features/auth/employee_list_screen.dart';
import '../features/auth/pin_entry_screen.dart';
import '../features/home/employee_home_screen.dart';
import '../features/role_select/role_select_screen.dart';
import '../features/splash/splash_screen.dart';

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
  ],
);
