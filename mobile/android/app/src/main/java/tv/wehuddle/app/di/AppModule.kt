package tv.wehuddle.app.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.create
import tv.wehuddle.app.BuildConfig
import tv.wehuddle.app.data.local.PreferencesManager
import tv.wehuddle.app.data.network.AuthInterceptor
import tv.wehuddle.app.data.network.HuddleApiService
import tv.wehuddle.app.data.network.SocketClient
import tv.wehuddle.app.data.repository.RoomRepository
import tv.wehuddle.app.data.webrtc.WebRTCManager
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideJson(): Json {
        return Json {
            ignoreUnknownKeys = true
            isLenient = true
            explicitNulls = false
        }
    }
    
    @Provides
    @Singleton
    fun provideSocketClient(
        @ApplicationContext context: Context
    ): SocketClient {
        return SocketClient(context)
    }
    
    @Provides
    @Singleton
    fun providePreferencesManager(
        @ApplicationContext context: Context
    ): PreferencesManager {
        return PreferencesManager(context)
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)

        if (BuildConfig.DEBUG) {
            val logging = HttpLoggingInterceptor()
            logging.level = HttpLoggingInterceptor.Level.BASIC
            builder.addInterceptor(logging)
        }

        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        json: Json
    ): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    fun provideHuddleApiService(retrofit: Retrofit): HuddleApiService {
        return retrofit.create()
    }
    
    @Provides
    @Singleton
    fun provideRoomRepository(
        socketClient: SocketClient,
        preferencesManager: PreferencesManager
    ): RoomRepository {
        return RoomRepository(socketClient, preferencesManager)
    }
    
    @Provides
    @Singleton
    fun provideWebRTCManager(
        @ApplicationContext context: Context
    ): WebRTCManager {
        return WebRTCManager(context)
    }
}
