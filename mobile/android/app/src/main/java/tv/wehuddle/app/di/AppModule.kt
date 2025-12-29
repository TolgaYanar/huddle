package tv.wehuddle.app.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import tv.wehuddle.app.data.local.PreferencesManager
import tv.wehuddle.app.data.network.SocketClient
import tv.wehuddle.app.data.repository.RoomRepository
import tv.wehuddle.app.data.webrtc.WebRTCManager
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    
    @Provides
    @Singleton
    fun provideSocketClient(): SocketClient {
        return SocketClient()
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
