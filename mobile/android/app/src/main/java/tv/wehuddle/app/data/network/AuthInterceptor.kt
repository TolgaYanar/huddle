package tv.wehuddle.app.data.network

import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response
import tv.wehuddle.app.BuildConfig
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: AuthTokenProvider
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider.currentToken()

        if (BuildConfig.DEBUG) {
            Log.d(
                "AuthInterceptor",
                "authHeader=${!token.isNullOrBlank()} url=${chain.request().url}"
            )
        }

        val request = if (!token.isNullOrBlank()) {
            chain.request().newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }

        return chain.proceed(request)
    }
}
