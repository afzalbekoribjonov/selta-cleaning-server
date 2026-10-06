package uz.selta.selta_cleaning

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Chek printeri (core/printing/printer_channel.dart).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, BluetoothPrinterChannel.CHANNEL)
            .setMethodCallHandler(BluetoothPrinterChannel())
    }
}
