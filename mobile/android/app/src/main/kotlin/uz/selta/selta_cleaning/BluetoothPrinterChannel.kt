package uz.selta.selta_cleaning

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.os.Handler
import android.os.Looper
import android.util.Log
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Chek printeriga Bluetooth (SPP) orqali ulanish.
 *
 * Tayyor plagin (print_bluetooth_thermal) o'rniga o'zimizniki — arzon
 * xitoy termoprinterlari bilan ishlagan usul (gilam_yuvish_furqat
 * loyihasida sinalgan). Plagindagi muammolar:
 *
 *  1. Soket yopilmas edi — printer esa bir vaqtda faqat BITTA ulanishni
 *     qabul qiladi, shu sabab keyingi urinish (yoki boshqa telefon)
 *     ulana olmay qolardi.
 *  2. Faqat standart ulanish usuli. Arzon printerlar xizmat ro'yxatini
 *     to'g'ri e'lon qilmaydi va faqat zaxira usul bilan ulanadi.
 *  3. Katta ma'lumot bir zarbda yuborilardi — kichik xotirali printer
 *     qatorlarni tushirib qoldiradi.
 *  4. Ruxsat bo'lmasa javob umuman qaytmas, ilova kutib qolardi.
 */
class BluetoothPrinterChannel : MethodChannel.MethodCallHandler {

    companion object {
        const val CHANNEL = "selta/printer"
        private const val TAG = "SeltaPrinter"

        /** Ketma-ket port (SPP) xizmatining standart identifikatori. */
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

        /** Bir marta yuboriladigan eng katta bo'lak. */
        private const val CHUNK = 1024
    }

    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private var socket: BluetoothSocket? = null
    private var output: OutputStream? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "isBluetoothOn" -> runAsync(result) { adapter()?.isEnabled == true }

            "pairedDevices" -> runAsync(result) { pairedDevices() }

            "connect" -> {
                val mac = call.argument<String>("mac")
                if (mac.isNullOrEmpty()) result.success("failed") else runAsync(result) { connect(mac) }
            }

            "write" -> {
                val bytes = call.argument<ByteArray>("bytes")
                if (bytes == null) result.success(false) else runAsync(result) { write(bytes) }
            }

            "disconnect" -> runAsync(result) {
                closeQuietly()
                true
            }

            else -> result.notImplemented()
        }
    }

    /**
     * Bluetooth amallari alohida oqimda, BITTA-BITTADAN bajariladi (ulanish
     * tugamasdan yozish boshlanmaydi); javob HAR DOIM asosiy oqimga
     * qaytariladi — aks holda Dart tarafi kutib qoladi.
     */
    private fun runAsync(result: MethodChannel.Result, action: () -> Any?) {
        worker.execute {
            val value = try {
                action()
            } catch (e: Exception) {
                Log.w(TAG, "Amal bajarilmadi: ${e.message}")
                null
            }
            main.post { result.success(value) }
        }
    }

    @Suppress("DEPRECATION")
    private fun adapter(): BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

    private fun pairedDevices(): List<Map<String, Any>> {
        val adapter = adapter() ?: return emptyList()
        return try {
            adapter.bondedDevices.orEmpty().map {
                mapOf(
                    "name" to (it.name ?: ""),
                    "mac" to it.address,
                    // Printerlar odatda "tasvir" turidagi qurilma deb e'lon
                    // qilinadi — ro'yxatda birinchi ko'rsatish uchun.
                    "printer" to (it.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING),
                )
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Juftlangan qurilmalarni o'qib bo'lmadi: ${e.message}")
            emptyList()
        }
    }

    /** Natija: "ok" | "bt_off" | "not_paired" | "failed". */
    private fun connect(mac: String): String {
        val adapter = adapter() ?: return "bt_off"
        if (!adapter.isEnabled) return "bt_off"

        // Eski ulanish albatta yopiladi — printer bittadan ortiq ulanishni
        // qabul qilmaydi.
        closeQuietly()

        val device = try {
            adapter.getRemoteDevice(mac)
        } catch (e: Exception) {
            Log.w(TAG, "Qurilma topilmadi: ${e.message}")
            return "not_paired"
        }

        // Qidiruv ochiq bo'lsa ulanish sekinlashadi yoki uziladi.
        try {
            adapter.cancelDiscovery()
        } catch (e: SecurityException) {
            Log.w(TAG, "cancelDiscovery: ${e.message}")
        }

        // 1-usul: standart. Ko'pchilik qurilmalar shu bilan ulanadi.
        if (open { device.createRfcommSocketToServiceRecord(SPP_UUID) }) return "ok"

        // 2-usul: arzon termoprinterlarning katta qismi faqat shu bilan
        // ulanadi — ular xizmat ro'yxatini to'g'ri e'lon qilmaydi.
        if (open { fallbackSocket(device) }) return "ok"

        return "failed"
    }

    private fun open(factory: () -> BluetoothSocket?): Boolean {
        var candidate: BluetoothSocket? = null
        return try {
            candidate = factory() ?: return false
            candidate.connect()
            socket = candidate
            output = candidate.outputStream
            true
        } catch (e: Exception) {
            Log.w(TAG, "Ulanib bo'lmadi: ${e.message}")
            try {
                candidate?.close()
            } catch (_: Exception) {
            }
            socket = null
            output = null
            false
        }
    }

    /** Yashirin `createRfcommSocket(1)` usuli — 1-kanal orqali to'g'ridan-to'g'ri. */
    private fun fallbackSocket(device: BluetoothDevice): BluetoothSocket? {
        return try {
            val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            method.invoke(device, 1) as BluetoothSocket
        } catch (e: Exception) {
            Log.w(TAG, "Zaxira usul ishlamadi: ${e.message}")
            null
        }
    }

    private fun write(bytes: ByteArray): Boolean {
        val stream = output ?: return false
        return try {
            // Bo'laklab: katta ma'lumot bir zarbda yuborilsa ba'zi printerlar
            // qatorlarni tushirib qoldiradi.
            var offset = 0
            while (offset < bytes.size) {
                val end = minOf(offset + CHUNK, bytes.size)
                stream.write(bytes, offset, end - offset)
                stream.flush()
                offset = end
            }
            true
        } catch (e: Exception) {
            Log.w(TAG, "Yozib bo'lmadi: ${e.message}")
            // Aloqa uzilgan — keyingi urinish toza ulanishdan boshlansin.
            closeQuietly()
            false
        }
    }

    private fun closeQuietly() {
        try {
            output?.flush()
        } catch (_: Exception) {
        }
        try {
            output?.close()
        } catch (_: Exception) {
        }
        try {
            socket?.close()
        } catch (_: Exception) {
        }
        output = null
        socket = null
    }
}
