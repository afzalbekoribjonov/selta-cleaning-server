import 'package:go_router/go_router.dart';

import '../features/auth/employee_list_placeholder_screen.dart';
import '../features/role_select/role_select_screen.dart';
import '../features/splash/splash_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/select', builder: (context, state) => const RoleSelectScreen()),
    GoRoute(
      path: '/employees/:department',
      builder: (context, state) => EmployeeListPlaceholderScreen(
        departmentName: state.pathParameters['department']!,
      ),
    ),
  ],
);
